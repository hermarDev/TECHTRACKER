use crate::audit::write_audit_log;
use crate::error::{AppError, Result};
use crate::middleware::AuthUser;
use crate::state::AppState;
use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::Utc;
use serde::Deserialize;
use serde_json::json;
use sqlx::{QueryBuilder, Row};
use uuid::Uuid;

#[derive(Deserialize, Default)]
struct InspQuery {
    page: Option<i64>,
    #[serde(rename = "pageSize")]
    page_size: Option<i64>,
    #[serde(rename = "roomId")]
    room_id: Option<String>,
    status: Option<String>,
}

#[derive(Deserialize, Default)]
struct ExportQuery {
    format: Option<String>,
}

#[derive(Deserialize)]
struct ItemInput {
    #[serde(rename = "unitId")]
    unit_id: String,
    condition: String,
    remarks: Option<String>,
    #[serde(rename = "photoKey")]
    photo_key: Option<String>,
}

#[derive(Deserialize)]
struct InspCreateInput {
    #[serde(rename = "roomId")]
    room_id: String,
    #[serde(rename = "summaryNote")]
    summary_note: Option<String>,
    items: Vec<ItemInput>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/inspections", get(list).post(create))
        .route("/api/inspections/rooms", get(rooms))
        .route("/api/inspections/:id/export", get(export))
        .route("/api/inspections/:id/review", post(review))
}

async fn list(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<InspQuery>,
) -> Result<Json<serde_json::Value>> {
    if !["STUDENT", "ADMIN", "SUPERADMIN"].contains(&auth.0.role.as_str()) {
        return Err(AppError::Forbidden);
    }
    let page = q.page.unwrap_or(1).max(1);
    let mut ps = q.page_size.unwrap_or(15);
    if ![15, 25, 50].contains(&ps) {
        ps = 15;
    }
    let skip = (page - 1) * ps;
    let mut count_query = QueryBuilder::new(
        "SELECT COUNT(*) as c FROM \"Inspection\" i JOIN \"LabRoom\" r ON r.id = i.\"roomId\" WHERE TRUE",
    );
    let mut data_query = QueryBuilder::new(
        "SELECT i.id,i.\"roomId\",i.\"inspectorId\",i.status::text,i.\"summaryNote\",i.\"reviewedById\",i.\"reviewedAt\"::timestamptz,i.\"createdAt\"::timestamptz FROM \"Inspection\" i JOIN \"LabRoom\" r ON r.id = i.\"roomId\" WHERE TRUE",
    );
    match auth.0.role.as_str() {
        "STUDENT" => {
            count_query
                .push(" AND r.\"assignedStudentId\"=")
                .push_bind(&auth.0.sub);
            data_query
                .push(" AND r.\"assignedStudentId\"=")
                .push_bind(&auth.0.sub);
        }
        "ADMIN" => {
            count_query
                .push(" AND (r.\"assignedAdminId\"=")
                .push_bind(&auth.0.sub)
                .push(" OR r.\"assignedAdminId\" IS NULL)");
            data_query
                .push(" AND (r.\"assignedAdminId\"=")
                .push_bind(&auth.0.sub)
                .push(" OR r.\"assignedAdminId\" IS NULL)");
        }
        _ => {}
    }
    if let Some(rid) = &q.room_id {
        count_query.push(" AND i.\"roomId\"=").push_bind(rid);
        data_query.push(" AND i.\"roomId\"=").push_bind(rid);
    }
    if let Some(s) = &q.status {
        if s == "SUBMITTED" || s == "REVIEWED" {
            count_query.push(" AND i.status::text=").push_bind(s);
            data_query.push(" AND i.status::text=").push_bind(s);
        }
    }
    let total: i64 = count_query
        .build()
        .fetch_one(&state.db)
        .await?
        .try_get("c")
        .unwrap_or(0);
    let rows = data_query
        .push(" ORDER BY i.\"createdAt\" DESC LIMIT ")
        .push_bind(ps)
        .push(" OFFSET ")
        .push_bind(skip)
        .build()
        .fetch_all(&state.db)
        .await?;
    let mut items = Vec::new();
    for r in rows {
        let iid: String = r.try_get("id")?;
        let insp_items = sqlx::query("SELECT id,\"inspectionId\",\"unitId\",condition::text,remarks,\"photoKey\" FROM \"InspectionItem\" WHERE \"inspectionId\"=$1 ORDER BY id ASC")
            .bind(&iid).fetch_all(&state.db).await.unwrap_or_default();
        let items_json: Vec<serde_json::Value> = insp_items
            .into_iter()
            .map(|it| {
                json!({
                    "id": it.try_get::<String,_>("id").unwrap_or_default(),
                    "inspectionId": it.try_get::<String,_>("inspectionId").unwrap_or_default(),
                    "unitId": it.try_get::<String,_>("unitId").unwrap_or_default(),
                    "condition": it.try_get::<String,_>("condition").unwrap_or_default(),
                    "remarks": it.try_get::<Option<String>,_>("remarks").unwrap_or(None),
                    "photoKey": it.try_get::<Option<String>,_>("photoKey").unwrap_or(None),
                })
            })
            .collect();
        let room = sqlx::query("SELECT id,name,building,capacity,\"isActive\",\"assignedAdminId\",\"assignedStudentId\",\"createdAt\"::timestamptz FROM \"LabRoom\" WHERE id=$1")
            .bind(r.try_get::<String, _>("roomId").unwrap_or_default())
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten();
        let room_json = room.map(|rm| json!({
            "id": rm.try_get::<String,_>("id").unwrap_or_default(),
            "name": rm.try_get::<String,_>("name").unwrap_or_default(),
            "building": rm.try_get::<String,_>("building").unwrap_or_default(),
            "capacity": rm.try_get::<i32,_>("capacity").unwrap_or(40),
            "isActive": rm.try_get::<bool,_>("isActive").unwrap_or(true),
            "assignedAdminId": rm.try_get::<Option<String>,_>("assignedAdminId").unwrap_or(None),
            "assignedStudentId": rm.try_get::<Option<String>,_>("assignedStudentId").unwrap_or(None),
            "createdAt": rm.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
        }));
        let inspector = sqlx::query("SELECT id,\"fullName\",email FROM \"User\" WHERE id=$1")
            .bind(r.try_get::<String, _>("inspectorId").unwrap_or_default())
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten();
        let inspector_json = inspector.map(|u| json!({"id": u.try_get::<String,_>("id").unwrap_or_default(), "fullName": u.try_get::<String,_>("fullName").unwrap_or_default(), "email": u.try_get::<String,_>("email").unwrap_or_default()}));
        items.push(json!({
            "id": iid,
            "roomId": r.try_get::<String,_>("roomId").unwrap_or_default(),
            "room": room_json,
            "inspectorId": r.try_get::<String,_>("inspectorId").unwrap_or_default(),
            "inspector": inspector_json,
            "status": r.try_get::<String,_>("status").unwrap_or_default(),
            "summaryNote": r.try_get::<Option<String>,_>("summaryNote").unwrap_or(None),
            "reviewedById": r.try_get::<Option<String>,_>("reviewedById").unwrap_or(None),
            "reviewedAt": r.try_get::<Option<chrono::DateTime<Utc>>,_>("reviewedAt").ok().flatten().map(|d| d.to_rfc3339()),
            "createdAt": r.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
            "items": items_json,
        }));
    }
    Ok(Json(
        json!({"data": items, "page": page, "pageSize": ps, "total": total, "totalPages": (total as f64 / ps as f64).ceil() as i64}),
    ))
}

async fn create(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<serde_json::Value>,
) -> Result<Response> {
    let input: InspCreateInput =
        serde_json::from_value(body).map_err(|_| AppError::BadRequest("Invalid input".into()))?;
    if input.items.is_empty() {
        return Err(AppError::BadRequest(
            "At least one unit item is required".into(),
        ));
    }
    for item in &input.items {
        if !["FUNCTIONING", "NEEDS_MAINTENANCE", "NEEDS_REPAIR"].contains(&item.condition.as_str())
        {
            return Err(AppError::BadRequest("Invalid unit condition".into()));
        }
    }
    // room
    let room = sqlx::query(
        "SELECT id,\"assignedAdminId\",\"assignedStudentId\" FROM \"LabRoom\" WHERE id=$1",
    )
    .bind(&input.room_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound)?;
    let assigned_admin: Option<String> = room.try_get("assignedAdminId").ok();
    let assigned_student: Option<String> = room.try_get("assignedStudentId").ok();
    // canInspectRoom logic
    let can = match auth.0.role.as_str() {
        "SUPERADMIN" => true,
        "ADMIN" => assigned_admin.is_none() || assigned_admin.as_deref() == Some(&auth.0.sub),
        "STUDENT" => assigned_student.as_deref() == Some(&auth.0.sub),
        _ => false,
    };
    if !can {
        return Err(AppError::Forbidden);
    }
    // mandatory remarks check
    for it in &input.items {
        if (it.condition == "NEEDS_MAINTENANCE" || it.condition == "NEEDS_REPAIR")
            && it
                .remarks
                .as_ref()
                .map(|s| s.trim().is_empty())
                .unwrap_or(true)
        {
            return Err(AppError::BadRequest(
                "Defect remarks are required for units flagged NEEDS_MAINTENANCE or NEEDS_REPAIR"
                    .into(),
            ));
        }
    }
    let iid = Uuid::new_v4().to_string();
    let mut tx = state.db.begin().await?;
    sqlx::query("INSERT INTO \"Inspection\" (id,\"roomId\",\"inspectorId\",status,\"summaryNote\",\"createdAt\") VALUES ($1,$2,$3,'SUBMITTED',$4,NOW())")
        .bind(&iid).bind(&input.room_id).bind(&auth.0.sub).bind(input.summary_note.as_deref()).execute(&mut *tx).await?;
    for it in &input.items {
        sqlx::query("INSERT INTO \"InspectionItem\" (id,\"inspectionId\",\"unitId\",condition,remarks,\"photoKey\") VALUES ($1,$2,$3,$4::\"UnitCondition\",$5,$6)")
            .bind(Uuid::new_v4().to_string()).bind(&iid).bind(&it.unit_id).bind(&it.condition)
            .bind(it.remarks.as_deref()).bind(it.photo_key.as_deref()).execute(&mut *tx).await?;
    }
    crate::audit::write_audit_log_tx(
        &mut tx,
        Some(&auth.0.sub),
        "INSPECTION_SUBMITTED",
        "Inspection",
        &iid,
        json!({"roomId": input.room_id, "itemCount": input.items.len()}),
    )
    .await
    .ok();
    tx.commit().await?;
    // fetch created
    let insp = sqlx::query("SELECT id,\"roomId\",\"inspectorId\",status::text,\"summaryNote\",\"createdAt\"::timestamptz FROM \"Inspection\" WHERE id=$1").bind(&iid).fetch_one(&state.db).await?;
    let items = sqlx::query("SELECT id,\"inspectionId\",\"unitId\",condition::text,remarks,\"photoKey\" FROM \"InspectionItem\" WHERE \"inspectionId\"=$1 ORDER BY id ASC").bind(&iid).fetch_all(&state.db).await.unwrap_or_default();
    let items_json: Vec<serde_json::Value> = items
        .into_iter()
        .map(|it| {
            json!({
                "id": it.try_get::<String,_>("id").unwrap_or_default(),
                "inspectionId": it.try_get::<String,_>("inspectionId").unwrap_or_default(),
                "unitId": it.try_get::<String,_>("unitId").unwrap_or_default(),
                "condition": it.try_get::<String,_>("condition").unwrap_or_default(),
                "remarks": it.try_get::<Option<String>,_>("remarks").unwrap_or(None),
                "photoKey": it.try_get::<Option<String>,_>("photoKey").unwrap_or(None),
            })
        })
        .collect();
    Ok((StatusCode::CREATED, Json(json!({"inspection": {
        "id": insp.try_get::<String,_>("id").unwrap_or_default(),
        "roomId": insp.try_get::<String,_>("roomId").unwrap_or_default(),
        "inspectorId": insp.try_get::<String,_>("inspectorId").unwrap_or_default(),
        "status": insp.try_get::<String,_>("status").unwrap_or_default(),
        "summaryNote": insp.try_get::<Option<String>,_>("summaryNote").unwrap_or(None),
        "createdAt": insp.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
        "items": items_json,
    }}))).into_response())
}

async fn rooms(State(state): State<AppState>, auth: AuthUser) -> Result<Json<serde_json::Value>> {
    if !["STUDENT", "ADMIN", "SUPERADMIN"].contains(&auth.0.role.as_str()) {
        return Err(AppError::Forbidden);
    }
    let rooms = sqlx::query(
        "SELECT id,name,building FROM \"LabRoom\" WHERE \"isActive\"=true ORDER BY name ASC",
    )
    .fetch_all(&state.db)
    .await?;
    let mut out = Vec::new();
    for r in rooms {
        let rid: String = r.try_get("id")?;
        let assigned_admin: Option<String> =
            sqlx::query("SELECT \"assignedAdminId\" FROM \"LabRoom\" WHERE id=$1")
                .bind(&rid)
                .fetch_one(&state.db)
                .await?
                .try_get("assignedAdminId")
                .ok();
        let assigned_student: Option<String> =
            sqlx::query("SELECT \"assignedStudentId\" FROM \"LabRoom\" WHERE id=$1")
                .bind(&rid)
                .fetch_one(&state.db)
                .await?
                .try_get("assignedStudentId")
                .ok();
        let accessible = match auth.0.role.as_str() {
            "SUPERADMIN" => true,
            "ADMIN" => assigned_admin.is_none() || assigned_admin.as_deref() == Some(&auth.0.sub),
            _ => assigned_student.as_deref() == Some(&auth.0.sub),
        };
        if !accessible {
            continue;
        }
        let units = sqlx::query("SELECT id,\"unitCode\",condition::text FROM \"ComputerUnit\" WHERE \"roomId\"=$1 ORDER BY \"unitCode\" ASC").bind(&rid).fetch_all(&state.db).await.unwrap_or_default();
        let units_json: Vec<serde_json::Value> = units
            .into_iter()
            .map(|u| {
                json!({
                    "id": u.try_get::<String,_>("id").unwrap_or_default(),
                    "unitCode": u.try_get::<String,_>("unitCode").unwrap_or_default(),
                    "condition": u.try_get::<String,_>("condition").unwrap_or_default(),
                })
            })
            .collect();
        out.push(json!({
            "id": rid,
            "name": r.try_get::<String,_>("name").unwrap_or_default(),
            "building": r.try_get::<String,_>("building").unwrap_or_default(),
            "units": units_json,
        }));
    }
    write_audit_log(
        &state,
        Some(&auth.0.sub),
        "INSPECTION_ROOMS_LISTED",
        "LabRoom",
        "all",
        json!({"count": out.len()}),
    )
    .await
    .ok();
    Ok(Json(json!({"rooms": out})))
}

async fn export(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
    Query(params): Query<ExportQuery>,
) -> Result<Response> {
    let format = if params
        .format
        .as_deref()
        .is_some_and(|value| value.eq_ignore_ascii_case("pdf"))
    {
        "pdf"
    } else {
        "csv"
    };

    let meta = sqlx::query(
        "SELECT i.\"inspectorId\", r.\"assignedAdminId\", r.\"assignedStudentId\"          FROM \"Inspection\" i JOIN \"LabRoom\" r ON r.id = i.\"roomId\" WHERE i.id = $1",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await?;
    let meta = meta.ok_or(AppError::NotFound)?;
    let inspector_id: String = meta.try_get("inspectorId")?;
    let assigned_admin: Option<String> = meta.try_get("assignedAdminId").ok();
    let assigned_student: Option<String> = meta.try_get("assignedStudentId").ok();
    let allowed = match auth.0.role.as_str() {
        "SUPERADMIN" => true,
        "ADMIN" => assigned_admin.is_none() || assigned_admin.as_deref() == Some(&auth.0.sub),
        "STUDENT" => inspector_id == auth.0.sub || assigned_student.as_deref() == Some(&auth.0.sub),
        _ => false,
    };
    if !allowed {
        return Err(AppError::Forbidden);
    }

    let rows = sqlx::query(
        "SELECT r.name AS room, u.\"unitCode\" AS \"unitCode\", ii.condition::text AS condition, \
         ii.remarks AS remarks, ii.\"photoKey\" AS \"photoKey\", i.\"createdAt\"::timestamptz AS \"inspectedAt\", \
         us.\"fullName\" AS inspector \
         FROM \"InspectionItem\" ii \
         JOIN \"Inspection\" i ON i.id = ii.\"inspectionId\" \
         JOIN \"LabRoom\" r ON r.id = i.\"roomId\" \
         JOIN \"ComputerUnit\" u ON u.id = ii.\"unitId\" \
         JOIN \"User\" us ON us.id = i.\"inspectorId\" \
         WHERE ii.\"inspectionId\" = $1 \
         ORDER BY ii.id ASC",
    )
    .bind(&id)
    .fetch_all(&state.db)
    .await?;

    // Match Next.js: an empty result set yields an empty body.
    let item_count = rows.len();

    if format == "pdf" {
        let pdf_rows: Vec<crate::pdf::InspectionSummaryRow> = rows
            .iter()
            .map(|row| crate::pdf::InspectionSummaryRow {
                room: row.try_get("room").unwrap_or_default(),
                unit_code: row.try_get("unitCode").unwrap_or_default(),
                condition: row.try_get("condition").unwrap_or_default(),
                remarks: row
                    .try_get::<Option<String>, _>("remarks")
                    .unwrap_or(None)
                    .unwrap_or_default(),
                photo_key: row.try_get::<Option<String>, _>("photoKey").unwrap_or(None),
                inspected_at: row
                    .try_get::<chrono::DateTime<Utc>, _>("inspectedAt")
                    .map(|d| d.to_rfc3339())
                    .unwrap_or_default(),
                inspector: row.try_get("inspector").unwrap_or_default(),
            })
            .collect();
        let _ = write_audit_log(
            &state,
            Some(&auth.0.sub),
            "INSPECTION_EXPORTED",
            "Inspection",
            &id,
            json!({"format": "pdf", "itemCount": item_count}),
        )
        .await;
        let pdf_bytes = crate::pdf::generate_inspection_pdf(&pdf_rows);
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "application/pdf")
            .header(
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"room-condition-summary-{id}.pdf\""),
            )
            .body(Body::from(pdf_bytes))
            .map_err(|e| AppError::Internal(e.to_string()));
    }

    let mut csv = String::new();
    if !rows.is_empty() {
        csv.push_str("room,unitCode,condition,remarks,photoKey,inspectedAt,inspector\n");
        for row in &rows {
            let room: String = row.try_get("room").unwrap_or_default();
            let unit_code: String = row.try_get("unitCode").unwrap_or_default();
            let condition: String = row.try_get("condition").unwrap_or_default();
            let remarks: String = row
                .try_get::<Option<String>, _>("remarks")
                .unwrap_or(None)
                .unwrap_or_default();
            let photo_key: String = row
                .try_get::<Option<String>, _>("photoKey")
                .unwrap_or(None)
                .unwrap_or_default();
            let inspected_at: chrono::DateTime<Utc> =
                row.try_get("inspectedAt").unwrap_or_else(|_| Utc::now());
            let inspector: String = row.try_get("inspector").unwrap_or_default();
            csv.push_str(&format!(
                "{},{},{},{},{},{},{}\n",
                csv_cell(&room),
                csv_cell(&unit_code),
                csv_cell(&condition),
                csv_cell(&remarks),
                csv_cell(&photo_key),
                csv_cell(&inspected_at.to_rfc3339()),
                csv_cell(&inspector),
            ));
        }
    }

    let _ = write_audit_log(
        &state,
        Some(&auth.0.sub),
        "INSPECTION_EXPORTED",
        "Inspection",
        &id,
        json!({"format": "csv", "itemCount": item_count}),
    )
    .await;

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/csv; charset=utf-8")
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"room-condition-summary-{id}.csv\""),
        )
        .body(Body::from(csv))
        .map_err(|e| AppError::Internal(e.to_string()))
}

fn csv_cell(value: &str) -> String {
    let sanitized = if value.starts_with(['=', '+', '-', '@', '\t', '\r']) {
        format!("'{value}")
    } else {
        value.to_string()
    };
    if sanitized.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", sanitized.replace('"', "\"\""))
    } else {
        sanitized
    }
}

async fn review(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    if !["ADMIN", "SUPERADMIN"].contains(&auth.0.role.as_str()) {
        return Err(AppError::Forbidden);
    }
    let insp = sqlx::query(
        "SELECT i.status::text, r.\"assignedAdminId\" FROM \"Inspection\" i JOIN \"LabRoom\" r ON r.id=i.\"roomId\" WHERE i.id=$1",
    )
    .bind(&id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    let status: String = insp.try_get("status")?;
    let assigned_admin: Option<String> = insp.try_get("assignedAdminId").ok();
    if auth.0.role == "ADMIN"
        && assigned_admin.is_some()
        && assigned_admin.as_deref() != Some(&auth.0.sub)
    {
        return Err(AppError::Forbidden);
    }
    if status != "SUBMITTED" {
        return Err(AppError::Conflict(
            "This inspection has already been reviewed.".into(),
        ));
    }
    let updated_rows = sqlx::query("UPDATE \"Inspection\" SET status='REVIEWED',\"reviewedById\"=$1,\"reviewedAt\"=NOW() WHERE id=$2 AND status='SUBMITTED'")
        .bind(&auth.0.sub).bind(&id).execute(&state.db).await?;
    if updated_rows.rows_affected() == 0 {
        return Err(AppError::Conflict(
            "This inspection has already been reviewed.".into(),
        ));
    }
    write_audit_log(
        &state,
        Some(&auth.0.sub),
        "INSPECTION_REVIEWED",
        "Inspection",
        &id,
        json!({"status": "REVIEWED", "reviewedBy": auth.0.sub}),
    )
    .await
    .ok();
    let updated = sqlx::query("SELECT id,\"roomId\",\"inspectorId\",status::text,\"summaryNote\",\"reviewedById\",\"reviewedAt\"::timestamptz,\"createdAt\"::timestamptz FROM \"Inspection\" WHERE id=$1").bind(&id).fetch_one(&state.db).await?;
    let items = sqlx::query("SELECT id,\"inspectionId\",\"unitId\",condition::text,remarks,\"photoKey\" FROM \"InspectionItem\" WHERE \"inspectionId\"=$1 ORDER BY id ASC").bind(&id).fetch_all(&state.db).await.unwrap_or_default();
    let items_json: Vec<serde_json::Value> = items
        .into_iter()
        .map(|it| {
            json!({
                "id": it.try_get::<String,_>("id").unwrap_or_default(),
                "inspectionId": it.try_get::<String,_>("inspectionId").unwrap_or_default(),
                "unitId": it.try_get::<String,_>("unitId").unwrap_or_default(),
                "condition": it.try_get::<String,_>("condition").unwrap_or_default(),
                "remarks": it.try_get::<Option<String>,_>("remarks").unwrap_or(None),
                "photoKey": it.try_get::<Option<String>,_>("photoKey").unwrap_or(None),
            })
        })
        .collect();
    let room_id: String = updated.try_get("roomId")?;
    let room = sqlx::query("SELECT id,name,building,capacity,\"isActive\",\"assignedAdminId\",\"assignedStudentId\",\"createdAt\"::timestamptz FROM \"LabRoom\" WHERE id=$1")
        .bind(&room_id).fetch_one(&state.db).await?;
    Ok(Json(json!({"inspection": {
        "id": updated.try_get::<String,_>("id").unwrap_or_default(),
        "roomId": updated.try_get::<String,_>("roomId").unwrap_or_default(),
        "inspectorId": updated.try_get::<String,_>("inspectorId").unwrap_or_default(),
        "status": updated.try_get::<String,_>("status").unwrap_or_default(),
        "summaryNote": updated.try_get::<Option<String>,_>("summaryNote").unwrap_or(None),
        "reviewedById": updated.try_get::<Option<String>,_>("reviewedById").unwrap_or(None),
        "reviewedAt": updated.try_get::<Option<chrono::DateTime<Utc>>,_>("reviewedAt").ok().flatten().map(|d| d.to_rfc3339()),
        "createdAt": updated.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
        "items": items_json,
        "room": {
            "id": room.try_get::<String,_>("id")?,
            "name": room.try_get::<String,_>("name")?,
            "building": room.try_get::<String,_>("building")?,
            "capacity": room.try_get::<i32,_>("capacity")?,
            "isActive": room.try_get::<bool,_>("isActive")?,
            "assignedAdminId": room.try_get::<Option<String>,_>("assignedAdminId")?,
            "assignedStudentId": room.try_get::<Option<String>,_>("assignedStudentId")?,
            "createdAt": room.try_get::<chrono::DateTime<Utc>,_>("createdAt")?.to_rfc3339(),
        },
    }})))
}
