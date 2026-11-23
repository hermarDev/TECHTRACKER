use crate::error::{AppError, Result};
use crate::middleware::AuthUser;
use crate::state::AppState;
use axum::body::Body;
use axum::extract::{Multipart, Path, Query, State};
use axum::http::{header, StatusCode};
use axum::response::Response;
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::{NaiveDate, Timelike, Utc};
use serde::Deserialize;
use serde_json::json;
use sqlx::Row;
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

fn normalize_pagination(page: Option<i64>, page_size: Option<i64>) -> (i64, i64, i64) {
    let page = page.unwrap_or(1).max(1);
    let mut ps = page_size.unwrap_or(15);
    if ![15, 25, 50].contains(&ps) {
        ps = 15;
    }
    let skip = (page - 1) * ps;
    (page, ps, skip)
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
    let (page, page_size, skip) = normalize_pagination(q.page, q.page_size);
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

    // build where clause
    let _cond: Vec<String> = Vec::new();
    let _params: Vec<String> = Vec::new(); // we'll bind dynamically via query builder? sqlx needs typed; use string params only for text, handle ints separately. Simpler: build SQL with placeholders and bind in order using a Vec of enum? sqlx query runtime allows .bind any type but chain must match. We'll do sequential binds with a macro-like approach using a helper query string and then bind each.

    // We'll instead fetch all rows then filter/paginate in Rust for prototype simplicity.
    // But total count needed. We'll fetch all matching attendance logs (with role filter) then paginate.
    let base_sql = "SELECT a.id, a.\"studentId\", a.\"batchId\", a.\"scheduleId\", a.\"shiftDate\"::timestamptz, a.\"timeIn\"::timestamptz, a.\"timeOut\"::timestamptz, a.\"photoInKey\", a.\"photoOutKey\", a.\"isIrregular\", a.\"irregularReason\", a.status::text, a.\"recordedHours\", a.\"creditedHours\", a.\"createdAt\"::timestamptz FROM \"AttendanceLog\" a JOIN \"Batch\" b ON a.\"batchId\"=b.id JOIN \"User\" u ON a.\"studentId\"=u.id";

    // We'll collect rows with a dynamic filter by building SQL.
    // Simpler: fetch all then filter in Rust.
    let all_rows = sqlx::query(base_sql).fetch_all(&state.db).await?;

    let mut filtered: Vec<sqlx::postgres::PgRow> = Vec::new();
    for r in all_rows {
        // role filter
        let _student_id: String = r.try_get("studentId").unwrap_or_default();
        // need batch coordinator; re-query? We didn't include. Let's instead filter by re-fetching batch. For prototype, handle student/admin.
        // We'll apply filters below using a second pass with DB? This is getting messy.
        filtered.push(r);
    }
    // This approach is too weak for role filtering. Let's instead do role filtering via SQL joins including coordinator.

    // Redo: fetch with proper role filters using conditional SQL.
    // Build query string
    let mut where_clauses: Vec<String> = Vec::new();
    // role
    if auth.0.role == "STUDENT" {
        where_clauses.push(format!(
            "a.\"studentId\" = '{}'",
            auth.0.sub.replace('\'', "''")
        ));
    } else if auth.0.role == "ADMIN" {
        where_clauses.push(format!(
            "b.\"coordinatorId\" = '{}'",
            auth.0.sub.replace('\'', "''")
        ));
    }
    if !search.is_empty() {
        where_clauses.push(format!(
            "u.\"fullName\" ILIKE '%{}%'",
            search.replace('\'', "''").replace('%', "\\%")
        ));
    }
    if let Some(s) = &status {
        where_clauses.push(format!("a.status = '{}'", s.replace('\'', "''")));
    }
    if irregular.as_deref() == Some("true") {
        where_clauses.push("a.\"isIrregular\" = true".to_string());
    }

    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };
    let count_sql = format!("SELECT COUNT(*) as c FROM \"AttendanceLog\" a JOIN \"Batch\" b ON a.\"batchId\"=b.id JOIN \"User\" u ON a.\"studentId\"=u.id {}", where_sql);
    let total: i64 = sqlx::query(&count_sql)
        .fetch_one(&state.db)
        .await?
        .try_get("c")
        .unwrap_or(0);

    let data_sql = format!("SELECT a.id, a.\"studentId\", a.\"batchId\", a.\"scheduleId\", a.\"shiftDate\"::timestamptz, a.\"timeIn\"::timestamptz, a.\"timeOut\"::timestamptz, a.\"photoInKey\", a.\"photoOutKey\", a.\"isIrregular\", a.\"irregularReason\", a.status::text, a.\"recordedHours\", a.\"creditedHours\", a.\"createdAt\"::timestamptz, u.\"fullName\" as student_name, u.\"studentIdNo\" as student_no FROM \"AttendanceLog\" a JOIN \"Batch\" b ON a.\"batchId\"=b.id JOIN \"User\" u ON a.\"studentId\"=u.id {} ORDER BY a.\"shiftDate\"::timestamptz DESC, a.\"createdAt\"::timestamptz DESC LIMIT {} OFFSET {}", where_sql, page_size, skip);
    let rows = sqlx::query(&data_sql).fetch_all(&state.db).await?;

    // fetch schedule map
    let mut sched_map: std::collections::HashMap<String, serde_json::Value> =
        std::collections::HashMap::new();
    let scheds =
        sqlx::query("SELECT id,label,\"startTime\",\"endTime\",\"graceMinutes\" FROM \"Schedule\"")
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
) -> Result<Json<serde_json::Value>> {
    if auth.0.role != "STUDENT" {
        return Err(AppError::Forbidden);
    }

    // parse multipart
    let mut action: Option<String> = None;
    let mut schedule_id: Option<String> = None;
    let mut attendance_id: Option<String> = None;
    let mut shift_date: Option<String> = None;
    let mut photo_bytes: Option<Vec<u8>> = None;
    let mut photo_mime: Option<String> = None;
    let mut forbidden = false;

    while let Some(field) = multipart
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
                photo_mime = field.content_type().map(|s| s.to_string());
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|e| AppError::BadRequest(e.to_string()))?;
                photo_bytes = Some(bytes.to_vec());
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
    let photo_bytes =
        photo_bytes.ok_or_else(|| AppError::BadRequest("A photo is required.".into()))?;
    let mime = photo_mime.unwrap_or_default();
    if !mime.starts_with("image/") {
        return Err(AppError::BadRequest(
            "Time-In and Time-Out photos must be valid images up to 5 MB.".into(),
        ));
    }
    if photo_bytes.is_empty() || photo_bytes.len() > 5 * 1024 * 1024 {
        return Err(AppError::BadRequest(
            "Time-In and Time-Out photos must be valid images up to 5 MB.".into(),
        ));
    }

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

        let shift_day = shift_date_parsed.with_timezone(&Utc).date_naive();
        let today = Utc::now().date_naive();
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
        // evaluate schedule window
        let punch_minutes = now.hour() as i32 * 60 + now.minute() as i32;
        let parse_tm = |s: &str| -> i32 {
            let parts: Vec<&str> = s.split(':').collect();
            let h = parts
                .first()
                .and_then(|x| x.parse::<i32>().ok())
                .unwrap_or(0);
            let m = parts
                .get(1)
                .and_then(|x| x.parse::<i32>().ok())
                .unwrap_or(0);
            h * 60 + m
        };
        let start_min = parse_tm(&start_time);
        let end_min = parse_tm(&end_time);
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
        let ext = match mime.as_str() {
            "image/png" => ".png",
            "image/webp" => ".webp",
            "application/pdf" => ".pdf",
            _ => ".jpg",
        };
        let key = format!("attendance/{}{}", Uuid::new_v4(), ext);
        crate::storage::save_bytes(&key, &photo_bytes)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        let record_id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO \"AttendanceLog\" (id,\"studentId\",\"batchId\",\"scheduleId\",\"shiftDate\",\"timeIn\",\"photoInKey\",\"isIrregular\",\"irregularReason\",\"status\",\"recordedHours\",\"creditedHours\",\"createdAt\",\"updatedAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING',0,0,NOW(),NOW())")
            .bind(&record_id)
            .bind(&auth.0.sub)
            .bind(&batch_id)
            .bind(&sid)
            .bind(shift_date_parsed.with_timezone(&Utc))
            .bind(now)
            .bind(&key)
            .bind(is_irregular)
            .bind(irregular_reason.as_deref())
            .execute(&state.db).await?;

        let resp = json!({
            "receipt": {"id": record_id, "action": "TIME_IN", "confirmedAt": Utc::now().to_rfc3339()},
            "attendance": {"id": record_id, "studentId": auth.0.sub, "batchId": batch_id, "scheduleId": sid, "photoInKey": key, "isIrregular": is_irregular, "irregularReason": irregular_reason, "status": "PENDING"}
        });
        return Ok(Json(resp));
    }

    // TIME_OUT
    if action == "TIME_OUT" {
        let aid = attendance_id
            .ok_or_else(|| AppError::BadRequest("Attendance record is required.".into()))?;
        let mut tx = state.db.begin().await?;
        let existing = sqlx::query("SELECT id,\"timeIn\"::timestamptz,\"timeOut\"::timestamptz FROM \"AttendanceLog\" WHERE id=$1 AND \"studentId\"=$2 FOR UPDATE")
            .bind(&aid).bind(&auth.0.sub).fetch_optional(&mut *tx).await?
            .ok_or(AppError::NotFound)?;
        let time_out_existing: Option<chrono::DateTime<Utc>> = existing.try_get("timeOut").ok();
        if time_out_existing.is_some() {
            return Err(AppError::Conflict(
                "This attendance record is already timed out.".into(),
            ));
        }
        let time_in: chrono::DateTime<Utc> = existing.try_get("timeIn")?;
        let ext = match mime.as_str() {
            "image/png" => ".png",
            "image/webp" => ".webp",
            "application/pdf" => ".pdf",
            _ => ".jpg",
        };
        let key = format!("attendance/{}{}", Uuid::new_v4(), ext);
        crate::storage::save_bytes(&key, &photo_bytes)
            .await
            .map_err(|e| AppError::Internal(e.to_string()))?;

        let now = Utc::now();
        let diff_ms = now.timestamp_millis() - time_in.timestamp_millis();
        let recorded = if diff_ms <= 0 {
            0.0
        } else {
            (diff_ms as f64 / 3600000.0 * 100.0).round() / 100.0
        };

        sqlx::query("UPDATE \"AttendanceLog\" SET \"timeOut\"=$1, \"photoOutKey\"=$2, \"recordedHours\"=$3, \"updatedAt\"=NOW() WHERE id=$4")
            .bind(now).bind(&key).bind(recorded).bind(&aid).execute(&mut *tx).await?;
        tx.commit().await?;

        let resp = json!({
            "receipt": {"id": aid, "action": "TIME_OUT", "confirmedAt": now.to_rfc3339()},
            "attendance": {"id": aid, "timeOut": now.to_rfc3339(), "photoOutKey": key, "recordedHours": recorded}
        });
        return Ok(Json(resp));
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

async fn credit_rounding_rule(state: &AppState) -> String {
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
        "SELECT a.\"studentId\", a.\"timeIn\"::timestamptz, a.\"timeOut\"::timestamptz, a.status::text, b.\"coordinatorId\" FROM \"AttendanceLog\" a JOIN \"Batch\" b ON a.\"batchId\"=b.id WHERE a.id=$1 FOR UPDATE",
    )
    .bind(&id)
    .fetch_optional(&mut *tx)
    .await?
    .ok_or(AppError::NotFound)?;
    let student_id: String = att.try_get("studentId")?;
    let coord: String = att.try_get("coordinatorId")?;
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
    let credited = if b.status == "APPROVED" {
        if let Some(to) = time_out {
            let diff_ms = to.timestamp_millis() - time_in.timestamp_millis();
            let hours = if diff_ms <= 0 {
                0.0
            } else {
                diff_ms as f64 / 3600000.0
            };
            apply_credit_rounding(&rule, hours)
        } else {
            0.0
        }
    } else {
        0.0
    };

    sqlx::query("UPDATE \"AttendanceLog\" SET status=$1,\"creditedHours\"=$2,\"reviewerId\"=$3,\"reviewerRemarks\"=$4,\"reviewedAt\"=NOW() WHERE id=$5")
        .bind(&b.status).bind(credited).bind(&auth.0.sub).bind(if remarks.trim().is_empty() { None } else { Some(remarks.trim()) }).bind(&id)
        .execute(&mut *tx).await?;
    if b.status == "APPROVED" {
        // check preOjt completion
        let req_hours: f64 = sqlx::query("SELECT \"requiredHours\" FROM \"User\" WHERE id=$1")
            .bind(&student_id)
            .fetch_one(&mut *tx)
            .await?
            .try_get("requiredHours")
            .unwrap_or(100.0);
        let logs = sqlx::query(
            "SELECT status::text,\"creditedHours\" FROM \"AttendanceLog\" WHERE \"studentId\"=$1",
        )
        .bind(&student_id)
        .fetch_all(&mut *tx)
        .await
        .unwrap_or_default();
        let total: f64 = logs
            .iter()
            .map(|r| {
                if r.try_get::<String, _>("status").unwrap_or_default() == "APPROVED" {
                    r.try_get::<f64, _>("creditedHours").unwrap_or(0.0)
                } else {
                    0.0
                }
            })
            .sum();
        let pending_tasks: i64 = sqlx::query("SELECT COUNT(*) as c FROM \"TaskAssignment\" WHERE \"studentId\"=$1 AND status::text<>'ACCEPTED'").bind(&student_id).fetch_one(&mut *tx).await?.try_get("c").unwrap_or(0);
        if total >= req_hours && pending_tasks == 0 {
            sqlx::query("UPDATE \"User\" SET \"preOjtCompleted\"=true,\"preOjtCompletedAt\"=NOW() WHERE id=$1").bind(&student_id).execute(&mut *tx).await?;
        }
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
    let updated = sqlx::query("SELECT id,\"studentId\",\"batchId\",\"scheduleId\",\"shiftDate\"::timestamptz,\"timeIn\"::timestamptz,\"timeOut\"::timestamptz,\"photoInKey\",\"photoOutKey\",\"isIrregular\",\"irregularReason\",status::text,\"recordedHours\",\"creditedHours\",\"reviewerId\",\"reviewerRemarks\",\"reviewedAt\"::timestamptz,\"createdAt\"::timestamptz,\"updatedAt\"::timestamptz FROM \"AttendanceLog\" WHERE id=$1").bind(&id).fetch_one(&state.db).await?;
    Ok(Json(json!({"attendance": {
        "id": updated.try_get::<String,_>("id").unwrap_or_default(),
        "status": updated.try_get::<String,_>("status").unwrap_or_default(),
        "creditedHours": updated.try_get::<f64,_>("creditedHours").unwrap_or(0.0),
        "reviewerId": updated.try_get::<Option<String>,_>("reviewerId").unwrap_or(None),
        "reviewerRemarks": updated.try_get::<Option<String>,_>("reviewerRemarks").unwrap_or(None),
        "reviewedAt": updated.try_get::<Option<chrono::DateTime<Utc>>,_>("reviewedAt").ok().flatten().map(|d| d.to_rfc3339()),
    }})))
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
    let updated = sqlx::query("SELECT id,\"timeIn\"::timestamptz,\"timeOut\"::timestamptz,\"recordedHours\",\"correctedById\",\"correctionReason\",\"correctedAt\"::timestamptz FROM \"AttendanceLog\" WHERE id=$1").bind(&id).fetch_one(&state.db).await?;
    Ok(Json(json!({"attendance": {
        "id": updated.try_get::<String,_>("id").unwrap_or_default(),
        "timeIn": updated.try_get::<chrono::DateTime<Utc>,_>("timeIn").map(|d| d.to_rfc3339()).unwrap_or_default(),
        "timeOut": updated.try_get::<Option<chrono::DateTime<Utc>>,_>("timeOut").ok().flatten().map(|d| d.to_rfc3339()),
        "recordedHours": updated.try_get::<f64,_>("recordedHours").unwrap_or(0.0),
        "correctedById": updated.try_get::<Option<String>,_>("correctedById").unwrap_or(None),
        "correctionReason": updated.try_get::<Option<String>,_>("correctionReason").unwrap_or(None),
        "correctedAt": updated.try_get::<Option<chrono::DateTime<Utc>>,_>("correctedAt").ok().flatten().map(|d| d.to_rfc3339()),
    }})))
}

async fn escalate(
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
    let esc = sqlx::query("SELECT id,\"sourceType\",\"sourceId\",\"raisedById\",\"studentId\",summary,\"policyDetails\",status::text,\"createdAt\"::timestamptz FROM \"EscalationCase\" WHERE id=$1").bind(&eid).fetch_one(&state.db).await?;
    Ok(Json(json!({"escalation": {
        "id": esc.try_get::<String,_>("id").unwrap_or_default(),
        "sourceType": esc.try_get::<String,_>("sourceType").unwrap_or_default(),
        "sourceId": esc.try_get::<String,_>("sourceId").unwrap_or_default(),
        "raisedById": esc.try_get::<String,_>("raisedById").unwrap_or_default(),
        "studentId": esc.try_get::<String,_>("studentId").unwrap_or_default(),
        "summary": esc.try_get::<String,_>("summary").unwrap_or_default(),
        "policyDetails": esc.try_get::<String,_>("policyDetails").unwrap_or_default(),
        "status": esc.try_get::<String,_>("status").unwrap_or_default(),
        "createdAt": esc.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
    }})))
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
        "SELECT id,\"fullName\",\"studentIdNo\",program,section,\"requiredHours\",\"preOjtCompleted\",role::text, \
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
    let pre_completed: bool = student.try_get("preOjtCompleted")?;
    if !pre_completed {
        return Err(AppError::BadRequest(
            "Accreditation is available only for completed students.".into(),
        ));
    }
    let full_name: String = student.try_get("fullName")?;
    let student_id_no: Option<String> = student.try_get("studentIdNo").ok().flatten();
    let program: Option<String> = student.try_get("program").ok().flatten();
    let section: Option<String> = student.try_get("section").ok().flatten();
    let required_hours: f64 = student.try_get("requiredHours").unwrap_or(100.0);

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
            time_in: ti.format("%H:%M").to_string(),
            time_out: to.map(|d| d.format("%H:%M").to_string()),
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
}
