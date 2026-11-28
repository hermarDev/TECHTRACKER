use crate::error::{AppError, Result};
use crate::middleware::AuthUser;
use crate::state::AppState;
use crate::storage::{read_field_capped, sniff_mime, MAX_UPLOAD_BYTES};
use axum::body::Body;
use axum::extract::{Multipart, Path, Query, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{FixedOffset, NaiveDate, Timelike, Utc};
use serde::Deserialize;
use serde_json::json;
use sqlx::{QueryBuilder, Row};
use uuid::Uuid;

#[derive(Deserialize, Default)]
struct AttendanceQuery {
    page: Option<i64>,
    #[serde(rename = "pageSize")]
    page_size: Option<i64>,
    search: Option<String>,
    status: Option<String>,
    irregular: Option<String>,
}

#[derive(Deserialize, Default)]
struct AccredPdfQuery {
    #[serde(rename = "studentId")]
    student_id: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/attendance", get(list).post(create))
        .route("/api/attendance/:id/review", post(review))
        .route("/api/attendance/:id/correct", post(correct))
        .route("/api/attendance/:id/escalate", post(escalate))
        .route("/api/attendance/accreditation-pdf", get(accreditation_pdf))
}

/// Philippines has no DST; a fixed UTC+8 offset is sufficient for local punch times.
fn manila_tz() -> FixedOffset {
    FixedOffset::east_opt(8 * 3600).expect("UTC+8 is a valid fixed offset")
}

fn schedule_minutes(value: &str) -> i32 {
    let mut parts = value.split(':');
    let hours = parts
        .next()
        .and_then(|v| v.parse::<i32>().ok())
        .unwrap_or(0);
    let minutes = parts
        .next()
        .and_then(|v| v.parse::<i32>().ok())
        .unwrap_or(0);
    hours * 60 + minutes
}

/// Pre-OJT completion is derived live: approved credited hours and no unaccepted tasks.
pub(crate) async fn is_pre_ojt_completed(
    db: &sqlx::PgPool,
    student_id: &str,
    required_hours: f64,
) -> Result<bool> {
    let row = sqlx::query(
        "SELECT COALESCE(SUM(\"creditedHours\") FILTER (WHERE status::text='APPROVED'),0) AS hours, \
         EXISTS (SELECT 1 FROM \"TaskAssignment\" WHERE \"studentId\"=$1 AND status::text<>'ACCEPTED') AS pending \
         FROM \"AttendanceLog\" WHERE \"studentId\"=$1",
    )
    .bind(student_id)
    .fetch_one(db)
    .await?;
    let hours: f64 = row.try_get("hours")?;
    let pending: bool = row.try_get("pending")?;
    Ok(hours >= required_hours && !pending)
}

/// One query for a whole page of students, instead of one query per row.
pub(crate) async fn pre_ojt_completed_map(
    db: &sqlx::PgPool,
    student_ids: &[String],
) -> Result<std::collections::HashMap<String, bool>> {
    let mut result = std::collections::HashMap::new();
    if student_ids.is_empty() {
        return Ok(result);
    }
    let rows = sqlx::query(
        "SELECT u.id, u.\"requiredHours\" AS required, \
         COALESCE(SUM(a.\"creditedHours\") FILTER (WHERE a.status::text='APPROVED'),0) AS hours, \
         EXISTS (SELECT 1 FROM \"TaskAssignment\" ta WHERE ta.\"studentId\"=u.id AND ta.status::text<>'ACCEPTED') AS pending \
         FROM \"User\" u LEFT JOIN \"AttendanceLog\" a ON a.\"studentId\"=u.id \
         WHERE u.id = ANY($1) GROUP BY u.id",
    )
    .bind(student_ids)
    .fetch_all(db)
    .await?;
    for row in rows {
        let id: String = row.try_get("id")?;
        let required: f64 = row.try_get("required").unwrap_or(100.0);
        let hours: f64 = row.try_get("hours").unwrap_or(0.0);
        let pending: bool = row.try_get("pending").unwrap_or(false);
        result.insert(id, hours >= required && !pending);
    }
    Ok(result)
}

async fn attendance_row(state: &AppState, id: &str) -> Result<sqlx::postgres::PgRow> {
    Ok(sqlx::query("SELECT id,\"studentId\",\"batchId\",\"scheduleId\",\"shiftDate\"::timestamptz,\"timeIn\"::timestamptz,\"timeOut\"::timestamptz,\"photoInKey\",\"photoOutKey\",\"isIrregular\",\"irregularReason\",status::text,\"recordedHours\",\"creditedHours\",\"reviewerId\",\"reviewerRemarks\",\"reviewedAt\"::timestamptz,\"correctedById\",\"correctionReason\",\"correctedAt\"::timestamptz,\"createdAt\"::timestamptz,\"updatedAt\"::timestamptz FROM \"AttendanceLog\" WHERE id=$1")
        .bind(id).fetch_one(&state.db).await?)
}

fn attendance_json(row: &sqlx::postgres::PgRow) -> serde_json::Value {
    json!({
        "id": row.try_get::<String,_>("id").unwrap_or_default(),
        "studentId": row.try_get::<String,_>("studentId").unwrap_or_default(),
        "batchId": row.try_get::<String,_>("batchId").unwrap_or_default(),
        "scheduleId": row.try_get::<Option<String>,_>("scheduleId").unwrap_or(None),
        "shiftDate": row.try_get::<chrono::DateTime<Utc>,_>("shiftDate").map(|d| d.to_rfc3339()).unwrap_or_default(),
        "timeIn": row.try_get::<chrono::DateTime<Utc>,_>("timeIn").map(|d| d.to_rfc3339()).unwrap_or_default(),
        "timeOut": row.try_get::<Option<chrono::DateTime<Utc>>,_>("timeOut").ok().flatten().map(|d| d.to_rfc3339()),
        "photoInKey": row.try_get::<String,_>("photoInKey").unwrap_or_default(),
        "photoOutKey": row.try_get::<Option<String>,_>("photoOutKey").unwrap_or(None),
        "isIrregular": row.try_get::<bool,_>("isIrregular").unwrap_or(false),
        "irregularReason": row.try_get::<Option<String>,_>("irregularReason").unwrap_or(None),
        "status": row.try_get::<String,_>("status").unwrap_or_default(),
        "recordedHours": row.try_get::<f64,_>("recordedHours").unwrap_or(0.0),
        "creditedHours": row.try_get::<f64,_>("creditedHours").unwrap_or(0.0),
        "reviewerId": row.try_get::<Option<String>,_>("reviewerId").unwrap_or(None),
        "reviewerRemarks": row.try_get::<Option<String>,_>("reviewerRemarks").unwrap_or(None),
        "reviewedAt": row.try_get::<Option<chrono::DateTime<Utc>>,_>("reviewedAt").ok().flatten().map(|d| d.to_rfc3339()),
        "correctedById": row.try_get::<Option<String>,_>("correctedById").unwrap_or(None),
        "correctionReason": row.try_get::<Option<String>,_>("correctionReason").unwrap_or(None),
        "correctedAt": row.try_get::<Option<chrono::DateTime<Utc>>,_>("correctedAt").ok().flatten().map(|d| d.to_rfc3339()),
        "createdAt": row.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
        "updatedAt": row.try_get::<chrono::DateTime<Utc>,_>("updatedAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
    })
}

async fn list(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<AttendanceQuery>,
) -> Result<Json<serde_json::Value>> {
    // role check
    if !["STUDENT", "ADMIN", "SUPERADMIN"].contains(&auth.0.role.as_str()) {
        return Err(AppError::Forbidden);
    }
    let (page, page_size, skip) = super::normalize_pagination(q.page, q.page_size);
    let search = q.search.clone().unwrap_or_default().trim().to_string();
    let status = q.status.clone();
    let irregular = q.irregular.clone();

    // schedules
    let schedules = if auth.0.role == "STUDENT" {
        if let Some(bid) = &auth.0.batch_id {
            sqlx::query("SELECT id,label,\"startTime\",\"endTime\",\"graceMinutes\",\"batchId\" FROM \"Schedule\" WHERE \"isActive\"=true AND \"batchId\"=$1 ORDER BY label ASC")
                .bind(bid).fetch_all(&state.db).await?
        } else {
            sqlx::query("SELECT id,label,\"startTime\",\"endTime\",\"graceMinutes\",\"batchId\" FROM \"Schedule\" WHERE \"isActive\"=true ORDER BY label ASC")
                .fetch_all(&state.db).await?
        }
    } else {
        sqlx::query("SELECT id,label,\"startTime\",\"endTime\",\"graceMinutes\",\"batchId\" FROM \"Schedule\" WHERE \"isActive\"=true ORDER BY label ASC")
            .fetch_all(&state.db).await?
    };

    let schedules_json: Vec<serde_json::Value> = schedules
        .into_iter()
        .map(|r| {
            json!({
                "id": r.try_get::<String,_>("id").unwrap_or_default(),
                "label": r.try_get::<String,_>("label").unwrap_or_default(),
                "startTime": r.try_get::<String,_>("startTime").unwrap_or_default(),
                "endTime": r.try_get::<String,_>("endTime").unwrap_or_default(),
                "graceMinutes": r.try_get::<i32,_>("graceMinutes").unwrap_or(0),
                "batchId": r.try_get::<Option<String>,_>("batchId").unwrap_or(None),
            })
        })
        .collect();

    let mut count_query = QueryBuilder::new(
        "SELECT COUNT(*) as c FROM \"AttendanceLog\" a JOIN \"Batch\" b ON a.\"batchId\"=b.id JOIN \"User\" u ON a.\"studentId\"=u.id WHERE TRUE",
    );
    let mut data_query = QueryBuilder::new(
        "SELECT a.id, a.\"studentId\", a.\"batchId\", a.\"scheduleId\", a.\"shiftDate\"::timestamptz, a.\"timeIn\"::timestamptz, a.\"timeOut\"::timestamptz, a.\"photoInKey\", a.\"photoOutKey\", a.\"isIrregular\", a.\"irregularReason\", a.status::text, a.\"recordedHours\", a.\"creditedHours\", a.\"reviewerId\", a.\"reviewerRemarks\", a.\"reviewedAt\"::timestamptz, a.\"createdAt\"::timestamptz, u.\"fullName\" as student_name, u.\"studentIdNo\" as student_no FROM \"AttendanceLog\" a JOIN \"Batch\" b ON a.\"batchId\"=b.id JOIN \"User\" u ON a.\"studentId\"=u.id WHERE TRUE",
    );
    if auth.0.role == "STUDENT" {
        count_query
            .push(" AND a.\"studentId\" = ")
            .push_bind(&auth.0.sub);
        data_query
            .push(" AND a.\"studentId\" = ")
            .push_bind(&auth.0.sub);
    } else if auth.0.role == "ADMIN" {
        count_query
            .push(" AND b.\"coordinatorId\" = ")
            .push_bind(&auth.0.sub);
        data_query
            .push(" AND b.\"coordinatorId\" = ")
            .push_bind(&auth.0.sub);
    }
    if !search.is_empty() {
        let pattern = format!(
            "%{}%",
            search
                .replace('!', "!!")
                .replace('%', "!%")
                .replace('_', "!_")
        );
        count_query
            .push(" AND u.\"fullName\" ILIKE ")
            .push_bind(pattern.clone())
            .push(" ESCAPE '!' ");
        data_query
            .push(" AND u.\"fullName\" ILIKE ")
            .push_bind(pattern.clone())
            .push(" ESCAPE '!' ");
    }
    if let Some(s) = &status {
        count_query.push(" AND a.status::text = ").push_bind(s);
        data_query.push(" AND a.status::text = ").push_bind(s);
    }
    if irregular.as_deref() == Some("true") {
        count_query.push(" AND a.\"isIrregular\" = TRUE");
        data_query.push(" AND a.\"isIrregular\" = TRUE");
    }
    let total: i64 = count_query
        .build()
        .fetch_one(&state.db)
        .await?
        .try_get("c")
        .unwrap_or(0);
    let rows = data_query
        .push(" ORDER BY a.\"shiftDate\" DESC, a.\"createdAt\" DESC LIMIT ")
        .push_bind(page_size)
        .push(" OFFSET ")
        .push_bind(skip)
        .build()
        .fetch_all(&state.db)
        .await?;

    // fetch schedule map
    let mut sched_map: std::collections::HashMap<String, serde_json::Value> =
        std::collections::HashMap::new();
    let scheds =
        sqlx::query("SELECT id,label,\"startTime\",\"endTime\",\"graceMinutes\",\"batchId\",\"isActive\",\"createdAt\"::timestamptz FROM \"Schedule\"")
            .fetch_all(&state.db)
            .await
            .unwrap_or_default();
    for s in scheds {
        let id: String = s.try_get("id").unwrap_or_default();
        sched_map.insert(
            id.clone(),
            json!({
                "id": id,
                "label": s.try_get::<String,_>("label").unwrap_or_default(),
                "startTime": s.try_get::<String,_>("startTime").unwrap_or_default(),
                "endTime": s.try_get::<String,_>("endTime").unwrap_or_default(),
                "graceMinutes": s.try_get::<i32,_>("graceMinutes").unwrap_or(0),
                "batchId": s.try_get::<String,_>("batchId").unwrap_or_default(),
                "isActive": s.try_get::<bool,_>("isActive").unwrap_or(true),
                "createdAt": s.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
            }),
        );
    }

    let items: Vec<serde_json::Value> = rows.into_iter().map(|r| {
        let sid: Option<String> = r.try_get("scheduleId").ok();
        let sched = sid.as_ref().and_then(|s| sched_map.get(s)).cloned();
        json!({
            "id": r.try_get::<String,_>("id").unwrap_or_default(),
            "studentId": r.try_get::<String,_>("studentId").unwrap_or_default(),
            "batchId": r.try_get::<String,_>("batchId").unwrap_or_default(),
            "scheduleId": sid,
            "schedule": sched,
            "shiftDate": r.try_get::<chrono::DateTime<Utc>,_>("shiftDate").map(|d| d.to_rfc3339()).unwrap_or_default(),
            "timeIn": r.try_get::<chrono::DateTime<Utc>,_>("timeIn").map(|d| d.to_rfc3339()).unwrap_or_default(),
            "timeOut": r.try_get::<Option<chrono::DateTime<Utc>>,_>("timeOut").ok().flatten().map(|d| d.to_rfc3339()),
            "photoInKey": r.try_get::<String,_>("photoInKey").unwrap_or_default(),
            "photoOutKey": r.try_get::<Option<String>,_>("photoOutKey").unwrap_or(None),
            "isIrregular": r.try_get::<bool,_>("isIrregular").unwrap_or(false),
            "irregularReason": r.try_get::<Option<String>,_>("irregularReason").unwrap_or(None),
            "status": r.try_get::<String,_>("status").unwrap_or_default(),
            "recordedHours": r.try_get::<f64,_>("recordedHours").unwrap_or(0.0),
            "creditedHours": r.try_get::<f64,_>("creditedHours").unwrap_or(0.0),
            "reviewerId": r.try_get::<Option<String>,_>("reviewerId").unwrap_or(None),
            "reviewerRemarks": r.try_get::<Option<String>,_>("reviewerRemarks").unwrap_or(None),
            "reviewedAt": r.try_get::<Option<chrono::DateTime<Utc>>,_>("reviewedAt").ok().flatten().map(|d| d.to_rfc3339()),
            "createdAt": r.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
            "student": {
                "id": r.try_get::<String,_>("studentId").unwrap_or_default(),
                "fullName": r.try_get::<String,_>("student_name").unwrap_or_default(),
                "studentIdNo": r.try_get::<Option<String>,_>("student_no").unwrap_or(None),
            }
        })
    }).collect();

    Ok(Json(json!({
        "items": items,
        "schedules": schedules_json,
        "total": total,
        "page": page,
        "pageSize": page_size,
    })))
}

async fn create(
    State(state): State<AppState>,
    auth: AuthUser,
    mut multipart: Multipart,
) -> Result<Response> {
    if auth.0.role != "STUDENT" {
        return Err(AppError::Forbidden);
    }

    // parse multipart
    let mut action: Option<String> = None;
    let mut schedule_id: Option<String> = None;
    let mut attendance_id: Option<String> = None;
    let mut shift_date: Option<String> = None;
    let mut photo: Option<(Vec<u8>, &'static str)> = None;
    let mut forbidden = false;

    while let Some(mut field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        if ["latitude", "longitude", "geolocation", "gps", "location"].contains(&name.as_str()) {
            forbidden = true;
            continue;
        }
        match name.as_str() {
            "action" => {
                action = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::BadRequest(e.to_string()))?,
                );
            }
            "scheduleId" => {
                schedule_id = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::BadRequest(e.to_string()))?,
                );
            }
            "attendanceId" => {
                attendance_id = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::BadRequest(e.to_string()))?,
                );
            }
            "shiftDate" => {
                shift_date = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::BadRequest(e.to_string()))?,
                );
            }
            "photo" => {
                let bytes = read_field_capped(&mut field, MAX_UPLOAD_BYTES)
                    .await
                    .map_err(|e| AppError::BadRequest(e.into()))?;
                let (mime, ext) = sniff_mime(&bytes).ok_or_else(|| {
                    AppError::BadRequest(
                        "Time-In and Time-Out photos must be valid images up to 5 MB.".into(),
                    )
                })?;
                if !mime.starts_with("image/") {
                    return Err(AppError::BadRequest(
                        "Time-In and Time-Out photos must be valid images up to 5 MB.".into(),
                    ));
                }
                photo = Some((bytes, ext));
            }
            _ => {}
        }
    }
    if forbidden {
        return Err(AppError::BadRequest(
            "GPS and geolocation fields are not accepted.".into(),
        ));
    }

    let action = action.ok_or_else(|| {
        AppError::BadRequest("Invalid attendance request. GPS fields are not supported.".into())
    })?;
    let (photo_bytes, photo_ext) =
        photo.ok_or_else(|| AppError::BadRequest("A photo is required.".into()))?;

    let batch_id = auth
        .0
        .batch_id
        .clone()
        .ok_or_else(|| AppError::BadRequest("Student is not assigned to a batch.".into()))?;

    if action == "TIME_IN" {
        let sid = schedule_id
            .ok_or_else(|| AppError::BadRequest("Schedule and shift date are required.".into()))?;
        let sd = shift_date
            .ok_or_else(|| AppError::BadRequest("Schedule and shift date are required.".into()))?;
        // schedule
        let sched = sqlx::query("SELECT id,\"startTime\",\"endTime\",\"graceMinutes\" FROM \"Schedule\" WHERE id=$1 AND \"batchId\"=$2 AND \"isActive\"=true")
            .bind(&sid).bind(&batch_id).fetch_optional(&state.db).await?
            .ok_or_else(|| AppError::NotFound)?;
        let start_time: String = sched.try_get("startTime")?;
        let end_time: String = sched.try_get("endTime")?;
        let grace: i32 = sched.try_get("graceMinutes")?;
        let shift_date_parsed = chrono::DateTime::parse_from_rfc3339(&sd)
            .ok()
            .or_else(|| {
                NaiveDate::parse_from_str(&sd, "%Y-%m-%d")
                    .ok()
                    .map(|d| d.and_hms_opt(0, 0, 0).unwrap().and_utc().fixed_offset())
            })
            .ok_or_else(|| AppError::BadRequest("Invalid shift date.".into()))?;

        let shift_day = shift_date_parsed.with_timezone(&manila_tz()).date_naive();
        let today = Utc::now().with_timezone(&manila_tz()).date_naive();
        if shift_day > today {
            return Err(AppError::BadRequest(
                "Shift date cannot be in the future.".into(),
            ));
        }

        // reject duplicate open time-in for today
        let open_exists = sqlx::query(
            "SELECT id FROM \"AttendanceLog\" WHERE \"studentId\"=$1 AND \"timeOut\" IS NULL AND \"shiftDate\"::date=$2",
        )
        .bind(&auth.0.sub)
        .bind(shift_day)
        .fetch_optional(&state.db)
        .await?;
        if open_exists.is_some() {
            return Err(AppError::Conflict(
                "An open attendance record already exists for today.".into(),
            ));
        }

        let now = Utc::now();
        // evaluate schedule window in local (Asia/Manila) time
        let now_local = now.with_timezone(&manila_tz());
        let punch_minutes = now_local.hour() as i32 * 60 + now_local.minute() as i32;
        let start_min = schedule_minutes(&start_time);
        let end_min = schedule_minutes(&end_time);
        let (is_irregular, irregular_reason) = if punch_minutes < start_min - grace {
            (
                true,
                Some(format!(
                    "Early Time-In outside {}–{} ({}m grace)",
                    start_time, end_time, grace
                )),
            )
        } else if punch_minutes > end_min + grace {
            (
                true,
                Some(format!(
                    "Late Time-In outside {}–{} ({}m grace)",
                    start_time, end_time, grace
                )),
            )
        } else {
            (false, None)
        };

        // save photo
        let key = format!("attendance/{}{}", Uuid::new_v4(), photo_ext);
        crate::storage::save_bytes(&key, &photo_bytes)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        let record_id = Uuid::new_v4().to_string();
        let insert = sqlx::query("INSERT INTO \"AttendanceLog\" (id,\"studentId\",\"batchId\",\"scheduleId\",\"shiftDate\",\"timeIn\",\"photoInKey\",\"isIrregular\",\"irregularReason\",\"status\",\"recordedHours\",\"creditedHours\",\"createdAt\",\"updatedAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING',0,0,NOW(),NOW())")
            .bind(&record_id)
            .bind(&auth.0.sub)
            .bind(&batch_id)
            .bind(&sid)
            .bind(shift_day.and_hms_opt(0, 0, 0).unwrap())
            .bind(now)
            .bind(&key)
            .bind(is_irregular)
            .bind(irregular_reason.as_deref())
            .execute(&state.db).await;
        if let Err(e) = insert {
            let _ = tokio::fs::remove_file(crate::storage::storage_root().join(&key)).await;
            if let sqlx::Error::Database(db) = &e {
                if db.code().as_deref() == Some("23505") {
                    return Err(AppError::Conflict(
                        "An open attendance record already exists for today.".into(),
                    ));
                }
            }
            return Err(e.into());
        }

        let attendance = attendance_row(&state, &record_id).await?;
        let created_at: chrono::DateTime<Utc> = attendance.try_get("createdAt")?;
        return Ok((StatusCode::CREATED, Json(json!({
            "receipt": {"id": record_id, "action": "TIME_IN", "confirmedAt": created_at.to_rfc3339()},
            "attendance": attendance_json(&attendance)
        }))).into_response());
    }

    // TIME_OUT
    if action == "TIME_OUT" {
        let aid = attendance_id
            .ok_or_else(|| AppError::BadRequest("Attendance record is required.".into()))?;
        let mut tx = state.db.begin().await?;
        let existing = sqlx::query("SELECT id,\"timeIn\"::timestamptz,\"timeOut\"::timestamptz,\"scheduleId\" FROM \"AttendanceLog\" WHERE id=$1 AND \"studentId\"=$2 FOR UPDATE")
            .bind(&aid).bind(&auth.0.sub).fetch_optional(&mut *tx).await?
            .ok_or(AppError::NotFound)?;
        let time_out_existing: Option<chrono::DateTime<Utc>> = existing.try_get("timeOut").ok();
        if time_out_existing.is_some() {
            return Err(AppError::Conflict(
                "This attendance record is already timed out.".into(),
            ));
        }
        let time_in: chrono::DateTime<Utc> = existing.try_get("timeIn")?;
        let key = format!("attendance/{}{}", Uuid::new_v4(), photo_ext);
        crate::storage::save_bytes(&key, &photo_bytes)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        let now = Utc::now();
        let raw_ms = now.timestamp_millis() - time_in.timestamp_millis();
        let schedule_id: Option<String> = existing.try_get("scheduleId").unwrap_or(None);
        let mut capped_ms = raw_ms;
        let mut overlong_reason: Option<String> = None;
        if let Some(sid) = schedule_id {
            let sched = sqlx::query(
                "SELECT \"startTime\",\"endTime\",\"graceMinutes\" FROM \"Schedule\" WHERE id=$1",
            )
            .bind(&sid)
            .fetch_optional(&mut *tx)
            .await?;
            if let Some(sched) = sched {
                let start_min = schedule_minutes(&sched.try_get::<String, _>("startTime")?);
                let end_min = schedule_minutes(&sched.try_get::<String, _>("endTime")?);
                let grace = sched.try_get::<i32, _>("graceMinutes").unwrap_or(0);
                let now_local = now.with_timezone(&manila_tz());
                let punch_minutes = now_local.hour() as i32 * 60 + now_local.minute() as i32;
                if punch_minutes > end_min + grace {
                    capped_ms =
                        (end_min - start_min).max(0) as i64 * 60_000 + grace as i64 * 120_000;
                    overlong_reason =
                        Some("Time-Out outside schedule window; hours capped.".into());
                }
            }
        }
        let effective_ms = capped_ms.min(raw_ms);
        let recorded = if effective_ms <= 0 {
            0.0
        } else {
            (effective_ms as f64 / 3600000.0 * 100.0).round() / 100.0
        };

        sqlx::query("UPDATE \"AttendanceLog\" SET \"timeOut\"=$1, \"photoOutKey\"=$2, \"recordedHours\"=$3, \"isIrregular\"=CASE WHEN $5::text IS NULL THEN \"isIrregular\" ELSE TRUE END, \"irregularReason\"=CASE WHEN $5::text IS NULL THEN \"irregularReason\" ELSE $5 END, \"updatedAt\"=NOW() WHERE id=$4")
            .bind(now).bind(&key).bind(recorded).bind(&aid)
            .bind(overlong_reason.as_deref()).execute(&mut *tx).await?;
        tx.commit().await?;

        let attendance = attendance_row(&state, &aid).await?;
        let updated_at: chrono::DateTime<Utc> = attendance.try_get("updatedAt")?;
        return Ok(Json(json!({
            "receipt": {"id": aid, "action": "TIME_OUT", "confirmedAt": updated_at.to_rfc3339()},
            "attendance": attendance_json(&attendance)
        }))
        .into_response());
    }

    Err(AppError::BadRequest(
        "Invalid attendance request. GPS fields are not supported.".into(),
    ))
}

async fn can_access(
    state: &AppState,
    user_id: &str,
    role: &str,
    att_id: &str,
) -> Result<(String, String)> {
    let row = sqlx::query("SELECT a.\"studentId\", b.\"coordinatorId\" FROM \"AttendanceLog\" a JOIN \"Batch\" b ON a.\"batchId\"=b.id WHERE a.id=$1")
        .bind(att_id).fetch_optional(&state.db).await?.ok_or(AppError::NotFound)?;
    let student_id: String = row.try_get("studentId")?;
    let coord: String = row.try_get("coordinatorId")?;
    let ok = match role {
        "SUPERADMIN" => true,
        "ADMIN" => coord == user_id,
        "STUDENT" => student_id == user_id,
        _ => false,
    };
    if !ok {
        return Err(AppError::NotFound);
    }
    Ok((student_id, coord))
}

pub(crate) fn apply_credit_rounding(rule: &str, hours: f64) -> f64 {
    if hours <= 0.0 || !hours.is_finite() {
        return 0.0;
    }
    let rounded = match rule {
        "ROUND_DOWN_15" => (hours * 4.0).floor() / 4.0,
        "ROUND_UP_15" => (hours * 4.0).ceil() / 4.0,
        "NEAREST_QUARTER" => (hours * 4.0).round() / 4.0,
        _ => (hours * 100.0).round() / 100.0,
    };
    (rounded * 100.0).round() / 100.0
}

pub(crate) async fn credit_rounding_rule(state: &AppState) -> String {
    let row =
        sqlx::query("SELECT \"creditRoundingRule\" FROM \"SystemConfig\" WHERE id='singleton'")
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten();
    row.and_then(|r| r.try_get::<String, _>("creditRoundingRule").ok())
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "EXACT_MINUTES".to_string())
}

fn resolve_credited_hours(
    rule: &str,
    time_in: chrono::DateTime<Utc>,
    time_out: Option<chrono::DateTime<Utc>>,
    recorded_hours: f64,
) -> f64 {
    let Some(to) = time_out else {
        return 0.0;
    };
    let hours = if recorded_hours > 0.0 {
        recorded_hours
    } else {
        let diff_ms = to.timestamp_millis() - time_in.timestamp_millis();
        if diff_ms <= 0 {
            0.0
        } else {
            diff_ms as f64 / 3600000.0
        }
    };
    apply_credit_rounding(rule, hours)
}

async fn review(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>> {
    if !["ADMIN", "SUPERADMIN"].contains(&auth.0.role.as_str()) {
        return Err(AppError::Forbidden);
    }
    #[derive(Deserialize)]
    struct B {
        status: String,
        remarks: Option<String>,
    }
    let b: B = serde_json::from_value(body)
        .map_err(|_| AppError::BadRequest("Rejection remarks are mandatory.".into()))?;
    if b.status != "APPROVED" && b.status != "REJECTED" {
        return Err(AppError::BadRequest(
            "Rejection remarks are mandatory.".into(),
        ));
    }
    let remarks = b.remarks.unwrap_or_default();
    if b.status == "REJECTED" && remarks.trim().is_empty() {
        return Err(AppError::BadRequest(
            "Rejection remarks are mandatory.".into(),
        ));
    }
    let rule = credit_rounding_rule(&state).await;
    let mut tx = state.db.begin().await?;
    let att = sqlx::query(
        "SELECT a.\"timeIn\"::timestamptz, a.\"timeOut\"::timestamptz, a.\"recordedHours\", a.status::text AS att_status, b.\"coordinatorId\" FROM \"AttendanceLog\" a JOIN \"Batch\" b ON a.\"batchId\"=b.id WHERE a.id=$1 FOR UPDATE",
    )
    .bind(&id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(AppError::NotFound)?;
    let coord: String = att.try_get("coordinatorId")?;
    let current_status: String = att.try_get("att_status")?;
    if current_status != "PENDING" {
        return Err(AppError::Conflict(
            "This attendance record has already been reviewed.".into(),
        ));
    }
    let ok = match auth.0.role.as_str() {
        "SUPERADMIN" => true,
        "ADMIN" => coord == auth.0.sub,
        _ => false,
    };
    if !ok {
        return Err(AppError::NotFound);
    }
    let time_in: chrono::DateTime<Utc> = att.try_get("timeIn")?;
    let time_out: Option<chrono::DateTime<Utc>> = att.try_get("timeOut").ok();
    let recorded_hours: f64 = att.try_get("recordedHours").unwrap_or(0.0);
    let credited = if b.status == "APPROVED" {
        resolve_credited_hours(&rule, time_in, time_out, recorded_hours)
    } else {
        0.0
    };

    let updated_rows = sqlx::query("UPDATE \"AttendanceLog\" SET status=$1::\"AttendanceStatus\",\"creditedHours\"=$2,\"reviewerId\"=$3,\"reviewerRemarks\"=$4,\"reviewedAt\"=NOW() WHERE id=$5 AND status='PENDING'")
        .bind(&b.status).bind(credited).bind(&auth.0.sub).bind(if remarks.trim().is_empty() { None } else { Some(remarks.trim()) }).bind(&id)
        .execute(&mut *tx).await?;
    if updated_rows.rows_affected() == 0 {
        return Err(AppError::Conflict(
            "This attendance record has already been reviewed.".into(),
        ));
    }
    crate::audit::write_audit_log_tx(
        &mut tx,
        Some(&auth.0.sub),
        &format!("ATTENDANCE_{}", b.status),
        "AttendanceLog",
        &id,
        json!({"remarks": remarks}),
    )
    .await
    .ok();
    tx.commit().await?;
    let updated = attendance_row(&state, &id).await?;
    Ok(Json(json!({"attendance": attendance_json(&updated)})))
}

async fn correct(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>> {
    if !["ADMIN", "SUPERADMIN"].contains(&auth.0.role.as_str()) {
        return Err(AppError::Forbidden);
    }
    #[derive(Deserialize)]
    struct B {
        #[serde(rename = "timeIn")]
        time_in: String,
        #[serde(rename = "timeOut")]
        time_out: Option<String>,
        #[serde(rename = "correctionReason")]
        reason: String,
    }
    let b: B = serde_json::from_value(body).map_err(|_| {
        AppError::BadRequest("Time-In, Time-Out, and correction reason are required.".into())
    })?;
    if b.reason.trim().is_empty() {
        return Err(AppError::BadRequest(
            "Time-In, Time-Out, and correction reason are required.".into(),
        ));
    }
    let time_in = chrono::DateTime::parse_from_rfc3339(&b.time_in)
        .map_err(|_| {
            AppError::BadRequest("Time-In, Time-Out, and correction reason are required.".into())
        })?
        .with_timezone(&Utc);
    let time_out = if let Some(t) = &b.time_out {
        Some(
            chrono::DateTime::parse_from_rfc3339(t)
                .map_err(|_| {
                    AppError::BadRequest(
                        "Time-In, Time-Out, and correction reason are required.".into(),
                    )
                })?
                .with_timezone(&Utc),
        )
    } else {
        None
    };
    if let Some(to) = time_out {
        if to <= time_in {
            return Err(AppError::BadRequest(
                "Time-Out must be after Time-In.".into(),
            ));
        }
    }
    let (_student_id, _) = can_access(&state, &auth.0.sub, &auth.0.role, &id).await?;
    let rule = credit_rounding_rule(&state).await;
    let mut tx = state.db.begin().await?;
    let existing = sqlx::query("SELECT \"timeIn\"::timestamptz,\"timeOut\"::timestamptz,status::text FROM \"AttendanceLog\" WHERE id=$1 FOR UPDATE")
        .bind(&id).fetch_one(&mut *tx).await?;
    let before_in: chrono::DateTime<Utc> = existing.try_get("timeIn")?;
    let before_out: Option<chrono::DateTime<Utc>> = existing.try_get("timeOut").ok();
    let status: String = existing.try_get("status").unwrap_or_default();
    let recorded = if let Some(to) = time_out {
        let diff = (to.timestamp_millis() - time_in.timestamp_millis()) as f64;
        if diff <= 0.0 {
            0.0
        } else {
            (diff / 3600000.0 * 100.0).round() / 100.0
        }
    } else {
        0.0
    };
    let credited = if status == "APPROVED" {
        if let Some(to) = time_out {
            let diff = (to.timestamp_millis() - time_in.timestamp_millis()) as f64;
            let hours = if diff <= 0.0 { 0.0 } else { diff / 3600000.0 };
            apply_credit_rounding(&rule, hours)
        } else {
            0.0
        }
    } else {
        0.0
    };
    sqlx::query("UPDATE \"AttendanceLog\" SET \"timeIn\"=$1,\"timeOut\"=$2,\"recordedHours\"=$3,\"creditedHours\"=$4,\"correctedById\"=$5,\"correctionReason\"=$6,\"correctedAt\"=NOW() WHERE id=$7")
        .bind(time_in).bind(time_out).bind(recorded).bind(credited).bind(&auth.0.sub).bind(b.reason.trim()).bind(&id).execute(&mut *tx).await?;
    crate::audit::write_audit_log_tx(&mut tx, Some(&auth.0.sub), "ATTENDANCE_CORRECTED", "AttendanceLog", &id, json!({"before": {"timeIn": before_in.to_rfc3339(), "timeOut": before_out.map(|d| d.to_rfc3339())}, "after": {"timeIn": time_in.to_rfc3339(), "timeOut": time_out.map(|d| d.to_rfc3339())}, "reason": b.reason.trim()})).await.ok();
    tx.commit().await?;
    let updated = attendance_row(&state, &id).await?;
    Ok(Json(json!({"attendance": attendance_json(&updated)})))
}

async fn escalate(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Response> {
    if !["ADMIN", "SUPERADMIN"].contains(&auth.0.role.as_str()) {
        return Err(AppError::Forbidden);
    }
    #[derive(Deserialize)]
    struct B {
        summary: String,
        #[serde(rename = "policyDetails")]
        policy_details: String,
    }
    let b: B = serde_json::from_value(body)
        .map_err(|_| AppError::BadRequest("Summary and policy details are required.".into()))?;
    if b.summary.trim().is_empty() || b.policy_details.trim().is_empty() {
        return Err(AppError::BadRequest(
            "Summary and policy details are required.".into(),
        ));
    }
    let (student_id, _) = can_access(&state, &auth.0.sub, &auth.0.role, &id).await?;
    let eid = Uuid::new_v4().to_string();
    let mut tx = state.db.begin().await?;
    sqlx::query("INSERT INTO \"EscalationCase\" (id,\"sourceType\",\"sourceId\",\"raisedById\",\"studentId\",summary,\"policyDetails\",status,\"createdAt\") VALUES ($1,'ATTENDANCE',$2,$3,$4,$5,$6,'OPEN',NOW())")
        .bind(&eid).bind(&id).bind(&auth.0.sub).bind(&student_id).bind(b.summary.trim()).bind(b.policy_details.trim()).execute(&mut *tx).await?;
    sqlx::query("UPDATE \"AttendanceLog\" SET status='ESCALATED' WHERE id=$1")
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    crate::audit::write_audit_log_tx(
        &mut tx,
        Some(&auth.0.sub),
        "ATTENDANCE_ESCALATED",
        "AttendanceLog",
        &id,
        json!({"escalationId": eid, "studentId": student_id}),
    )
    .await
    .ok();
    tx.commit().await?;
    let esc = sqlx::query("SELECT id,\"sourceType\"::text,\"sourceId\",\"raisedById\",\"studentId\",summary,\"policyDetails\",status::text,\"rulingNote\",\"ruledById\",\"ruledAt\"::timestamptz,\"createdAt\"::timestamptz FROM \"EscalationCase\" WHERE id=$1").bind(&eid).fetch_one(&state.db).await?;
    Ok((StatusCode::CREATED, Json(json!({"escalation": {
        "id": esc.try_get::<String,_>("id").unwrap_or_default(),
        "sourceType": esc.try_get::<String,_>("sourceType").unwrap_or_default(),
        "sourceId": esc.try_get::<String,_>("sourceId").unwrap_or_default(),
        "raisedById": esc.try_get::<String,_>("raisedById").unwrap_or_default(),
        "studentId": esc.try_get::<String,_>("studentId").unwrap_or_default(),
        "summary": esc.try_get::<String,_>("summary").unwrap_or_default(),
        "policyDetails": esc.try_get::<String,_>("policyDetails").unwrap_or_default(),
        "status": esc.try_get::<String,_>("status").unwrap_or_default(),
        "rulingNote": esc.try_get::<Option<String>,_>("rulingNote").unwrap_or(None),
        "ruledById": esc.try_get::<Option<String>,_>("ruledById").unwrap_or(None),
        "ruledAt": esc.try_get::<Option<chrono::DateTime<Utc>>,_>("ruledAt").ok().flatten().map(|d| d.to_rfc3339()),
        "createdAt": esc.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
    }}))).into_response())
}

async fn accreditation_pdf(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<AccredPdfQuery>,
) -> Result<Response> {
    if !["STUDENT", "ADMIN", "SUPERADMIN"].contains(&auth.0.role.as_str()) {
        return Err(AppError::Forbidden);
    }
    let student_id = q.student_id.unwrap_or_else(|| auth.0.sub.clone());
    // access check
    let student = sqlx::query(
        "SELECT id,\"fullName\",\"studentIdNo\",program,section,\"requiredHours\",role::text, \
         (SELECT \"coordinatorId\" FROM \"Batch\" WHERE id = \"User\".\"batchId\") AS coord \
         FROM \"User\" WHERE id=$1",
    )
    .bind(&student_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    let role: String = student.try_get("role")?;
    if role != "STUDENT" {
        return Err(AppError::NotFound);
    }
    let coord: Option<String> = student.try_get("coord").ok().flatten();
    if auth.0.role == "ADMIN" && coord.as_deref() != Some(auth.0.sub.as_str()) {
        return Err(AppError::NotFound);
    }
    if auth.0.role == "STUDENT" && student_id != auth.0.sub {
        return Err(AppError::NotFound);
    }
    let full_name: String = student.try_get("fullName")?;
    let student_id_no: Option<String> = student.try_get("studentIdNo").ok().flatten();
    let program: Option<String> = student.try_get("program").ok().flatten();
    let section: Option<String> = student.try_get("section").ok().flatten();
    let required_hours: f64 = student.try_get("requiredHours").unwrap_or(100.0);
    if !is_pre_ojt_completed(&state.db, &student_id, required_hours).await? {
        return Err(AppError::Conflict(
            "Accreditation is available only for completed students.".into(),
        ));
    }

    let logs = sqlx::query(
        "SELECT \"shiftDate\"::date::text, \"timeIn\"::timestamptz, \"timeOut\"::timestamptz, \"creditedHours\", \"isIrregular\" \
         FROM \"AttendanceLog\" WHERE \"studentId\"=$1 AND status::text='APPROVED' ORDER BY \"shiftDate\" ASC",
    )
    .bind(&student_id)
    .fetch_all(&state.db)
    .await?;

    let mut log_list = Vec::new();
    for r in logs {
        let shift: String = r.try_get("shiftDate").unwrap_or_default();
        let ti: chrono::DateTime<Utc> = r.try_get("timeIn")?;
        let to: Option<chrono::DateTime<Utc>> = r.try_get("timeOut").ok();
        let credited: f64 = r.try_get("creditedHours").unwrap_or(0.0);
        let irregular: bool = r.try_get("isIrregular").unwrap_or(false);
        log_list.push(crate::pdf::AccreditationLog {
            shift_date: shift,
            time_in: ti.with_timezone(&manila_tz()).format("%H:%M").to_string(),
            time_out: to.map(|d| d.with_timezone(&manila_tz()).format("%H:%M").to_string()),
            credited_hours: credited,
            is_irregular: irregular,
        });
    }

    let filename = format!(
        "accreditation-{}.pdf",
        student_id_no.clone().unwrap_or_else(|| student_id.clone())
    );
    let pdf_bytes = crate::pdf::generate_accreditation_pdf(
        &crate::pdf::AccreditationStudent {
            full_name,
            student_id_no,
            program,
            section,
            required_hours,
        },
        &log_list,
    );
    let resp = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/pdf")
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", filename),
        )
        .body(Body::from(pdf_bytes))
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(resp)
}

#[cfg(test)]
#[allow(clippy::items_after_test_module)]
mod tests {
    use super::apply_credit_rounding;

    #[test]
    fn exact_minutes_rounds_to_two_decimals() {
        assert_eq!(apply_credit_rounding("EXACT_MINUTES", 1.2345), 1.23);
        assert_eq!(apply_credit_rounding("EXACT_MINUTES", 0.0), 0.0);
    }

    #[test]
    fn round_down_15_floors_to_quarter() {
        assert_eq!(apply_credit_rounding("ROUND_DOWN_15", 1.1), 1.0);
        assert_eq!(apply_credit_rounding("ROUND_DOWN_15", 1.25), 1.25);
    }

    #[test]
    fn round_up_15_ceils_to_quarter() {
        assert_eq!(apply_credit_rounding("ROUND_UP_15", 1.1), 1.25);
    }

    #[test]
    fn nearest_quarter_rounds() {
        assert_eq!(apply_credit_rounding("NEAREST_QUARTER", 1.1), 1.0);
        assert_eq!(apply_credit_rounding("NEAREST_QUARTER", 1.13), 1.25);
    }

    #[test]
    fn unknown_rule_defaults_exact() {
        assert_eq!(apply_credit_rounding("NOPE", 2.3456), 2.35);
    }

    #[test]
    fn manila_shift_day_is_stored_as_local_midnight() {
        let parsed = chrono::DateTime::parse_from_rfc3339("2026-11-26T16:30:00Z").unwrap();
        let day = parsed.with_timezone(&super::manila_tz()).date_naive();
        let stored = day.and_hms_opt(0, 0, 0).unwrap();
        assert_eq!(stored.to_string(), "2026-11-27 00:00:00");
    }

    #[test]
    fn approval_uses_capped_recorded_hours_with_rounding() {
        let time_in = chrono::DateTime::parse_from_rfc3339("2026-11-26T00:00:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc);
        // Late Time-Out 10h later, but recordedHours was capped at 4.10h.
        let time_out = Some(time_in + chrono::Duration::hours(10));
        assert_eq!(
            super::resolve_credited_hours("ROUND_DOWN_15", time_in, time_out, 4.10),
            4.0
        );
        assert_eq!(
            super::resolve_credited_hours("EXACT_MINUTES", time_in, time_out, 4.10),
            4.1
        );
        // Falls back to elapsed time when recordedHours <= 0.
        assert_eq!(
            super::resolve_credited_hours("NEAREST_QUARTER", time_in, time_out, 0.0),
            10.0
        );
    }
}
