use crate::error::{AppError, Result};
use crate::middleware::AuthUser;
use crate::state::AppState;
use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, patch, post};
use axum::{Json, Router};
use chrono::{NaiveDate, Utc};
use serde::Deserialize;
use serde_json::json;
use sqlx::{QueryBuilder, Row};
use validator::ValidateEmail;

#[derive(Deserialize, Default)]
struct PageQ {
    page: Option<i64>,
    #[serde(rename = "pageSize")]
    page_size: Option<i64>,
    search: Option<String>,
    status: Option<String>,
    program: Option<String>,
    section: Option<String>,
    #[serde(rename = "isActive")]
    is_active: Option<String>,
}

#[derive(Deserialize, Default)]
struct ReportsQuery {
    #[serde(rename = "type")]
    report_type: Option<String>,
    #[serde(rename = "batchId")]
    batch_id: Option<String>,
    section: Option<String>,
    program: Option<String>,
    status: Option<String>,
    #[serde(rename = "dateFrom")]
    date_from: Option<String>,
    #[serde(rename = "dateTo")]
    date_to: Option<String>,
    format: Option<String>,
    page: Option<i64>,
    #[serde(rename = "pageSize")]
    page_size: Option<i64>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/admin/reports", get(reports))
        .route(
            "/api/admin/students",
            get(students_list).patch(students_patch),
        )
        .route(
            "/api/admin/students/import",
            post(crate::import::students_import),
        )
        .route("/api/admin/batches", get(batches_list).post(batches_create))
        .route("/api/admin/batches/:id", patch(batches_patch))
}

async fn reports(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<ReportsQuery>,
) -> Result<Response> {
    if !["ADMIN", "SUPERADMIN"].contains(&auth.0.role.as_str()) {
        return Err(AppError::Forbidden);
    }
    let (page, page_size, skip) = super::normalize_pagination(q.page, q.page_size);
    let kind = q.report_type.clone();
    let fmt = q
        .format
        .clone()
        .unwrap_or_else(|| "json".into())
        .to_ascii_lowercase();
    let is_export = fmt == "csv" || fmt == "pdf";

    // role scoping: ADMIN sees only their coordinated batches / created tasks
    let admin_scope = auth.0.role == "ADMIN";
    let parse_date = |value: Option<&String>| -> Result<Option<NaiveDate>> {
        match value.map(|s| s.trim()).filter(|s| !s.is_empty()) {
            Some(raw) => NaiveDate::parse_from_str(raw, "%Y-%m-%d")
                .map(Some)
                .map_err(|_| AppError::BadRequest("Invalid report date.".into())),
            None => Ok(None),
        }
    };
    let date_from = parse_date(q.date_from.as_ref())?;
    let date_to = parse_date(q.date_to.as_ref())?;

    let (rows, total): (Vec<Vec<String>>, i64) = match kind.as_deref() {
        Some("task-progress") => {
            let mut data_query = QueryBuilder::new(
                "SELECT COALESCE(b.name,'Unassigned batch') AS batch, COALESCE(b.section,'') AS section, 'Task Progress' AS metric, a.status::text AS value, u.\"fullName\" || ' - ' || t.title AS label FROM \"TaskAssignment\" a JOIN \"Task\" t ON t.id=a.\"taskId\" JOIN \"User\" u ON u.id=a.\"studentId\" LEFT JOIN \"Batch\" b ON b.id=COALESCE(t.\"batchId\", u.\"batchId\") WHERE TRUE",
            );
            let mut count_query = QueryBuilder::new(
                "SELECT COUNT(*) AS c FROM \"TaskAssignment\" a JOIN \"Task\" t ON t.id=a.\"taskId\" JOIN \"User\" u ON u.id=a.\"studentId\" LEFT JOIN \"Batch\" b ON b.id=COALESCE(t.\"batchId\", u.\"batchId\") WHERE TRUE",
            );
            if admin_scope {
                data_query
                    .push(" AND t.\"createdById\"=")
                    .push_bind(&auth.0.sub);
                count_query
                    .push(" AND t.\"createdById\"=")
                    .push_bind(&auth.0.sub);
            }
            if let Some(s) = &q.status {
                if [
                    "ASSIGNED",
                    "IN_PROGRESS",
                    "SUBMITTED",
                    "RETURNED",
                    "ACCEPTED",
                ]
                .contains(&s.as_str())
                {
                    data_query.push(" AND a.status::text=").push_bind(s);
                    count_query.push(" AND a.status::text=").push_bind(s);
                }
            }
            if let Some(bid) = &q.batch_id {
                data_query
                    .push(" AND COALESCE(t.\"batchId\", u.\"batchId\")=")
                    .push_bind(bid);
                count_query
                    .push(" AND COALESCE(t.\"batchId\", u.\"batchId\")=")
                    .push_bind(bid);
            }
            let total = count_query
                .build()
                .fetch_one(&state.db)
                .await?
                .try_get("c")
                .unwrap_or(0);
            data_query.push(" ORDER BY a.\"createdAt\" DESC");
            if is_export {
                data_query.push(" LIMIT 10000");
            } else {
                data_query
                    .push(" LIMIT ")
                    .push_bind(page_size)
                    .push(" OFFSET ")
                    .push_bind(skip);
            }
            (
                report_rows(data_query.build().fetch_all(&state.db).await?),
                total,
            )
        }
        Some("lab-equipment") => {
            let mut data_query = QueryBuilder::new(
                "SELECT '' AS batch, '' AS section, 'Lab Equipment' AS metric, u.condition::text AS value, r.name || ' - ' || u.\"unitCode\" AS label FROM \"ComputerUnit\" u JOIN \"LabRoom\" r ON r.id=u.\"roomId\" WHERE TRUE",
            );
            let mut count_query = QueryBuilder::new(
                "SELECT COUNT(*) AS c FROM \"ComputerUnit\" u JOIN \"LabRoom\" r ON r.id=u.\"roomId\" WHERE TRUE",
            );
            if admin_scope {
                data_query
                    .push(" AND (r.\"assignedAdminId\"=")
                    .push_bind(&auth.0.sub)
                    .push(" OR r.\"assignedAdminId\" IS NULL)");
                count_query
                    .push(" AND (r.\"assignedAdminId\"=")
                    .push_bind(&auth.0.sub)
                    .push(" OR r.\"assignedAdminId\" IS NULL)");
            }
            let total = count_query
                .build()
                .fetch_one(&state.db)
                .await?
                .try_get("c")
                .unwrap_or(0);
            data_query.push(" ORDER BY r.name ASC, u.\"unitCode\" ASC");
            if is_export {
                data_query.push(" LIMIT 10000");
            } else {
                data_query
                    .push(" LIMIT ")
                    .push_bind(page_size)
                    .push(" OFFSET ")
                    .push_bind(skip);
            }
            (
                report_rows(data_query.build().fetch_all(&state.db).await?),
                total,
            )
        }
        Some("attendance" | "duty-hours") => {
            let mut data_query = QueryBuilder::new(
                "SELECT b.name AS batch, b.section AS section, 'Attendance' AS metric, a.\"recordedHours\"::text AS value, a.status::text || ' - ' || u.\"fullName\" || ' (' || COALESCE(u.\"studentIdNo\",'') || ')' AS label FROM \"AttendanceLog\" a JOIN \"Batch\" b ON b.id=a.\"batchId\" JOIN \"User\" u ON u.id=a.\"studentId\" WHERE TRUE",
            );
            let mut count_query = QueryBuilder::new(
                "SELECT COUNT(*) AS c FROM \"AttendanceLog\" a JOIN \"Batch\" b ON b.id=a.\"batchId\" JOIN \"User\" u ON u.id=a.\"studentId\" WHERE TRUE",
            );
            if admin_scope {
                data_query
                    .push(" AND b.\"coordinatorId\"=")
                    .push_bind(&auth.0.sub);
                count_query
                    .push(" AND b.\"coordinatorId\"=")
                    .push_bind(&auth.0.sub);
            }
            if let Some(bid) = &q.batch_id {
                data_query.push(" AND a.\"batchId\"=").push_bind(bid);
                count_query.push(" AND a.\"batchId\"=").push_bind(bid);
            }
            if let Some(s) = &q.section {
                if !s.is_empty() {
                    data_query.push(" AND u.section=").push_bind(s);
                    count_query.push(" AND u.section=").push_bind(s);
                }
            }
            if let Some(p) = &q.program {
                if !p.is_empty() {
                    data_query.push(" AND u.program=").push_bind(p);
                    count_query.push(" AND u.program=").push_bind(p);
                }
            }
            if let Some(s) = &q.status {
                if ["PENDING", "APPROVED", "REJECTED", "ESCALATED"].contains(&s.as_str()) {
                    data_query.push(" AND a.status::text=").push_bind(s);
                    count_query.push(" AND a.status::text=").push_bind(s);
                }
            }
            if let Some(d) = date_from {
                data_query.push(" AND a.\"shiftDate\" >= ").push_bind(d);
                count_query.push(" AND a.\"shiftDate\" >= ").push_bind(d);
            }
            if let Some(d) = date_to {
                data_query.push(" AND a.\"shiftDate\" <= ").push_bind(d);
                count_query.push(" AND a.\"shiftDate\" <= ").push_bind(d);
            }
            let total = count_query
                .build()
                .fetch_one(&state.db)
                .await?
                .try_get("c")
                .unwrap_or(0);
            data_query.push(" ORDER BY a.\"shiftDate\" DESC");
            if is_export {
                data_query.push(" LIMIT 10000");
            } else {
                data_query
                    .push(" LIMIT ")
                    .push_bind(page_size)
                    .push(" OFFSET ")
                    .push_bind(skip);
            }
            (
                report_rows(data_query.build().fetch_all(&state.db).await?),
                total,
            )
        }
        _ => {
            let mut data_query = QueryBuilder::new(
                "SELECT '' AS batch, '' AS section, 'Attendance' AS metric, a.\"recordedHours\"::text AS value, a.status::text AS label FROM \"AttendanceLog\" a WHERE TRUE",
            );
            let mut count_query =
                QueryBuilder::new("SELECT COUNT(*) AS c FROM \"AttendanceLog\" a WHERE TRUE");
            if let Some(bid) = &q.batch_id {
                data_query.push(" AND a.\"batchId\"=").push_bind(bid);
                count_query.push(" AND a.\"batchId\"=").push_bind(bid);
            }
            if let Some(s) = &q.status {
                if ["PENDING", "APPROVED", "REJECTED", "ESCALATED"].contains(&s.as_str()) {
                    data_query.push(" AND a.status::text=").push_bind(s);
                    count_query.push(" AND a.status::text=").push_bind(s);
                }
            }
            if admin_scope {
                data_query.push(" AND EXISTS (SELECT 1 FROM \"Batch\" b WHERE b.id=a.\"batchId\" AND b.\"coordinatorId\"=").push_bind(&auth.0.sub).push(")");
                count_query.push(" AND EXISTS (SELECT 1 FROM \"Batch\" b WHERE b.id=a.\"batchId\" AND b.\"coordinatorId\"=").push_bind(&auth.0.sub).push(")");
            }
            let total = count_query
                .build()
                .fetch_one(&state.db)
                .await?
                .try_get("c")
                .unwrap_or(0);
            data_query.push(" ORDER BY a.\"shiftDate\" DESC");
            if is_export {
                data_query.push(" LIMIT 10000");
            } else {
                data_query
                    .push(" LIMIT ")
                    .push_bind(page_size)
                    .push(" OFFSET ")
                    .push_bind(skip);
            }
            (
                report_rows(data_query.build().fetch_all(&state.db).await?),
                total,
            )
        }
    };

    crate::audit::write_audit_log(&state, Some(&auth.0.sub), "REPORTS_VIEWED", "Report", kind.as_deref().unwrap_or("all"), json!({"type": kind, "filters": {"batchId": q.batch_id, "section": q.section, "program": q.program, "status": q.status, "dateFrom": q.date_from, "dateTo": q.date_to}})).await.ok();
    let safe_kind: String = kind
        .as_deref()
        .unwrap_or("all")
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    let safe_kind = if safe_kind.is_empty() {
        "all"
    } else {
        &safe_kind
    };
    let filename = format!("operational-report-{safe_kind}");

    if fmt == "csv" {
        let mut csv = String::new();
        if !rows.is_empty() {
            csv.push_str("batch,section,metric,value,label\n");
            for row in &rows {
                let cells: Vec<String> = row.iter().map(|c| super::csv_cell(c)).collect();
                csv.push_str(&cells.join(","));
                csv.push('\n');
            }
        }
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/csv; charset=utf-8")
            .header(
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{}.csv\"", filename),
            )
            .body(Body::from(csv))
            .map_err(|e| AppError::Internal(e.to_string()));
    }
    if fmt == "pdf" {
        let pdf_bytes = crate::pdf::generate_operational_report_pdf(
            &format!("Operational Report — {}", kind.as_deref().unwrap_or("all")),
            &["Batch", "Section", "Metric", "Value", "Label"],
            &rows,
        );
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "application/pdf")
            .header(
                header::CONTENT_DISPOSITION,
                format!("attachment; filename=\"{}.pdf\"", filename),
            )
            .body(Body::from(pdf_bytes))
            .map_err(|e| AppError::Internal(e.to_string()));
    }

    let data: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            json!({
                "batch": r[0],
                "section": r[1],
                "metric": r[2],
                "value": r[3],
                "label": r[4],
            })
        })
        .collect();
    Ok(Json(json!({
        "data": data,
        "page": page,
        "pageSize": page_size,
        "total": total,
        "totalPages": (total as f64 / page_size as f64).ceil() as i64,
    }))
    .into_response())
}

fn report_rows(rows: Vec<sqlx::postgres::PgRow>) -> Vec<Vec<String>> {
    rows.into_iter()
        .map(|row| {
            ["batch", "section", "metric", "value", "label"]
                .iter()
                .map(|key| row.try_get::<String, _>(*key).unwrap_or_default())
                .collect()
        })
        .collect()
}

async fn students_list(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<PageQ>,
) -> Result<Json<serde_json::Value>> {
    if !["ADMIN", "SUPERADMIN"].contains(&auth.0.role.as_str()) {
        return Err(AppError::Forbidden);
    }
    let (page, ps, skip) = super::normalize_pagination(q.page, q.page_size);
    let mut count_query = QueryBuilder::new(
        "SELECT COUNT(*) AS c FROM \"User\" u LEFT JOIN \"Batch\" b ON b.id=u.\"batchId\" WHERE u.role::text='STUDENT'",
    );
    let mut data_query = QueryBuilder::new(
        "SELECT u.id,u.email,u.\"fullName\",u.\"studentIdNo\",u.program,u.section,u.status::text,u.\"batchId\",u.\"requiredHours\",u.\"preOjtCompleted\",u.\"createdAt\"::timestamptz,b.name AS \"batchName\",b.section AS \"batchSection\" FROM \"User\" u LEFT JOIN \"Batch\" b ON b.id=u.\"batchId\" WHERE u.role::text='STUDENT'",
    );
    if let Some(search) = q.search.as_deref().filter(|s| !s.is_empty()) {
        let pattern = format!(
            "%{}%",
            search
                .replace('!', "!!")
                .replace('%', "!%")
                .replace('_', "!_")
        );
        for query in [&mut count_query, &mut data_query] {
            query
                .push(" AND (u.\"fullName\" ILIKE ")
                .push_bind(pattern.clone())
                .push(" ESCAPE '!' OR u.\"studentIdNo\" ILIKE ")
                .push_bind(pattern.clone())
                .push(" ESCAPE '!' OR u.email ILIKE ")
                .push_bind(pattern.clone())
                .push(" ESCAPE '!')");
        }
    }
    if let Some(status) = q
        .status
        .as_deref()
        .filter(|s| ["PENDING_VERIFICATION", "ACTIVE", "SUSPENDED", "DEACTIVATED"].contains(s))
    {
        count_query.push(" AND u.status::text=").push_bind(status);
        data_query.push(" AND u.status::text=").push_bind(status);
    }
    if let Some(program) = q.program.as_deref().filter(|s| !s.is_empty()) {
        count_query.push(" AND u.program=").push_bind(program);
        data_query.push(" AND u.program=").push_bind(program);
    }
    if let Some(section) = q.section.as_deref().filter(|s| !s.is_empty()) {
        count_query.push(" AND u.section=").push_bind(section);
        data_query.push(" AND u.section=").push_bind(section);
    }
    if auth.0.role == "ADMIN" {
        for query in [&mut count_query, &mut data_query] {
            query
                .push(" AND (u.\"batchId\" IS NULL OR b.\"coordinatorId\"=")
                .push_bind(&auth.0.sub)
                .push(")");
        }
    }
    let total: i64 = count_query
        .build()
        .fetch_one(&state.db)
        .await?
        .try_get("c")
        .unwrap_or(0);
    let rows = data_query
        .push(" ORDER BY u.\"fullName\" ASC LIMIT ")
        .push_bind(ps)
        .push(" OFFSET ")
        .push_bind(skip)
        .build()
        .fetch_all(&state.db)
        .await?;
    let student_ids: Vec<String> = rows
        .iter()
        .map(|r| r.try_get::<String, _>("id").unwrap_or_default())
        .collect();
    let completed_map =
        crate::routes::attendance::pre_ojt_completed_map(&state.db, &student_ids).await?;
    let mut items: Vec<serde_json::Value> = Vec::new();
    for r in rows {
        let batch_id: Option<String> = r.try_get("batchId").unwrap_or(None);
        let batch = batch_id.as_ref().map(|id| json!({"id": id, "name": r.try_get::<Option<String>,_>("batchName").unwrap_or(None), "section": r.try_get::<Option<String>,_>("batchSection").unwrap_or(None)}));
        let student_id: String = r.try_get("id")?;
        let required_hours: f64 = r.try_get("requiredHours").unwrap_or(100.0);
        let completed = completed_map.get(&student_id).copied().unwrap_or(false);
        items.push(json!({
            "id": student_id,
            "email": r.try_get::<String,_>("email").unwrap_or_default(),
            "fullName": r.try_get::<String,_>("fullName").unwrap_or_default(),
            "studentIdNo": r.try_get::<Option<String>,_>("studentIdNo").unwrap_or(None),
            "program": r.try_get::<Option<String>,_>("program").unwrap_or(None),
            "section": r.try_get::<Option<String>,_>("section").unwrap_or(None),
            "status": r.try_get::<String,_>("status").unwrap_or_default(),
            "batchId": batch_id,
            "requiredHours": required_hours,
            "preOjtCompleted": completed,
            "createdAt": r.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
            "batch": batch,
        }));
    }
    Ok(Json(
        json!({"data": items, "page": page, "pageSize": ps, "total": total, "totalPages": (total as f64 / ps as f64).ceil() as i64}),
    ))
}

async fn students_patch(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>> {
    if !["ADMIN", "SUPERADMIN"].contains(&auth.0.role.as_str()) {
        return Err(AppError::Forbidden);
    }
    if let Some(student_id) = body.get("studentId").and_then(serde_json::Value::as_str) {
        let row = sqlx::query("SELECT id,email,status::text,\"batchId\" FROM \"User\" WHERE id=$1 AND role::text='STUDENT'")
            .bind(student_id).fetch_optional(&state.db).await?.ok_or(AppError::NotFound)?;
        let batch_id: Option<String> = row.try_get("batchId")?;
        if auth.0.role == "ADMIN" {
            if let Some(batch_id) = &batch_id {
                let coordinator: String =
                    sqlx::query_scalar("SELECT \"coordinatorId\" FROM \"Batch\" WHERE id=$1")
                        .bind(batch_id)
                        .fetch_one(&state.db)
                        .await?;
                if coordinator != auth.0.sub {
                    return Err(AppError::Forbidden);
                }
            }
        }
        sqlx::query("UPDATE \"User\" SET status='ACTIVE',\"verificationToken\"=NULL,\"verificationSentAt\"=NULL,\"updatedAt\"=NOW() WHERE id=$1")
            .bind(student_id).execute(&state.db).await?;
        crate::audit::write_audit_log(&state, Some(&auth.0.sub), "STUDENT_VERIFIED", "User", student_id, json!({"email": row.try_get::<String,_>("email")?, "previousStatus": row.try_get::<String,_>("status")?})).await?;
        let student = sqlx::query("SELECT id,email,\"fullName\",role::text,status::text,\"studentIdNo\",program,section,phone,\"batchId\",\"requiredHours\",\"preOjtCompleted\",\"preOjtCompletedAt\"::timestamptz,\"createdAt\"::timestamptz,\"updatedAt\"::timestamptz FROM \"User\" WHERE id=$1")
            .bind(student_id).fetch_one(&state.db).await?;
        return Ok(Json(
            json!({"student": student_json(&state.db, &student).await?}),
        ));
    }
    let id = body
        .get("id")
        .and_then(serde_json::Value::as_str)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::BadRequest("Invalid input".into()))?;
    let current =
        sqlx::query("SELECT \"batchId\" FROM \"User\" WHERE id=$1 AND role::text='STUDENT'")
            .bind(id)
            .fetch_optional(&state.db)
            .await?
            .ok_or(AppError::NotFound)?;
    let current_batch: Option<String> = current.try_get("batchId")?;
    if auth.0.role == "ADMIN" {
        if let Some(batch_id) = &current_batch {
            let coordinator: String =
                sqlx::query_scalar("SELECT \"coordinatorId\" FROM \"Batch\" WHERE id=$1")
                    .bind(batch_id)
                    .fetch_one(&state.db)
                    .await?;
            if coordinator != auth.0.sub {
                return Err(AppError::Forbidden);
            }
        }
    }
    let status = body.get("status").and_then(serde_json::Value::as_str);
    if let Some(status) = status {
        if !["PENDING_VERIFICATION", "ACTIVE", "SUSPENDED", "DEACTIVATED"].contains(&status) {
            return Err(AppError::BadRequest("Invalid status".into()));
        }
    }
    let program = body.get("program").and_then(serde_json::Value::as_str);
    let section = body.get("section").and_then(serde_json::Value::as_str);
    let batch_id = body.get("batchId");
    if let Some(Some(new_batch_id)) = batch_id.map(serde_json::Value::as_str) {
        if auth.0.role == "ADMIN" {
            let coordinator: String =
                sqlx::query_scalar("SELECT \"coordinatorId\" FROM \"Batch\" WHERE id=$1")
                    .bind(new_batch_id)
                    .fetch_optional(&state.db)
                    .await?
                    .ok_or(AppError::NotFound)?;
            if coordinator != auth.0.sub {
                return Err(AppError::Forbidden);
            }
        }
    }
    if status.is_none() && program.is_none() && section.is_none() && batch_id.is_none() {
        return Err(AppError::BadRequest(
            "No fields to update were provided".into(),
        ));
    }
    let mut update = QueryBuilder::new("UPDATE \"User\" SET ");
    {
        let mut separated = update.separated(", ");
        if let Some(status) = status {
            separated
                .push("status=")
                .push_bind(status)
                .push_unseparated("::\"UserStatus\"");
        }
        if let Some(program) = program {
            separated.push("program=").push_bind(program);
        }
        if let Some(section) = section {
            separated.push("section=").push_bind(section);
        }
        if let Some(batch_id) = batch_id {
            separated.push("\"batchId\"=");
            if batch_id.is_null() {
                separated.push_unseparated("NULL");
            } else {
                separated.push_bind(batch_id.as_str().unwrap_or_default());
            }
        }
        separated.push_unseparated(", \"updatedAt\"=NOW() WHERE id=");
    }
    update
        .push_bind(id)
        .push(" AND role::text='STUDENT'")
        .build()
        .execute(&state.db)
        .await?;
    let student = sqlx::query("SELECT id,email,\"fullName\",role::text,status::text,\"studentIdNo\",program,section,phone,\"batchId\",\"requiredHours\",\"preOjtCompleted\",\"preOjtCompletedAt\"::timestamptz,\"createdAt\"::timestamptz,\"updatedAt\"::timestamptz FROM \"User\" WHERE id=$1")
        .bind(id).fetch_one(&state.db).await?;
    Ok(Json(
        json!({"student": student_json(&state.db, &student).await?}),
    ))
}

async fn student_json(db: &sqlx::PgPool, row: &sqlx::postgres::PgRow) -> Result<serde_json::Value> {
    let id: String = row.try_get("id")?;
    let required_hours: f64 = row.try_get("requiredHours").unwrap_or(100.0);
    let mut value = json!({
        "id": row.try_get::<String,_>("id").unwrap_or_default(),
        "email": row.try_get::<String,_>("email").unwrap_or_default(),
        "fullName": row.try_get::<String,_>("fullName").unwrap_or_default(),
        "role": row.try_get::<String,_>("role").unwrap_or_default(),
        "status": row.try_get::<String,_>("status").unwrap_or_default(),
        "studentIdNo": row.try_get::<Option<String>,_>("studentIdNo").unwrap_or(None),
        "program": row.try_get::<Option<String>,_>("program").unwrap_or(None),
        "section": row.try_get::<Option<String>,_>("section").unwrap_or(None),
        "phone": row.try_get::<Option<String>,_>("phone").unwrap_or(None),
        "batchId": row.try_get::<Option<String>,_>("batchId").unwrap_or(None),
        "requiredHours": row.try_get::<f64,_>("requiredHours").unwrap_or(100.0),
        "preOjtCompleted": row.try_get::<bool,_>("preOjtCompleted").unwrap_or(false),
        "preOjtCompletedAt": row.try_get::<Option<chrono::DateTime<Utc>>,_>("preOjtCompletedAt").ok().flatten().map(|d| d.to_rfc3339()),
        "createdAt": row.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
        "updatedAt": row.try_get::<chrono::DateTime<Utc>,_>("updatedAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
    });
    value["preOjtCompleted"] =
        json!(crate::routes::attendance::is_pre_ojt_completed(db, &id, required_hours).await?);
    Ok(value)
}

async fn batches_list(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<PageQ>,
) -> Result<Json<serde_json::Value>> {
    if !["ADMIN", "SUPERADMIN"].contains(&auth.0.role.as_str()) {
        return Err(AppError::Forbidden);
    }
    let (page, ps, skip) = super::normalize_pagination(q.page, q.page_size);
    let mut count_query = QueryBuilder::new("SELECT COUNT(*) AS c FROM \"Batch\" WHERE TRUE");
    let mut data_query = QueryBuilder::new("SELECT id,name,section,\"academicYear\",\"isActive\",\"coordinatorId\",\"createdAt\"::timestamptz,\"updatedAt\"::timestamptz FROM \"Batch\" WHERE TRUE");
    if let Some(search) = q.search.as_deref().filter(|s| !s.is_empty()) {
        let pattern = format!(
            "%{}%",
            search
                .replace('!', "!!")
                .replace('%', "!%")
                .replace('_', "!_")
        );
        for query in [&mut count_query, &mut data_query] {
            query
                .push(" AND (name ILIKE ")
                .push_bind(pattern.clone())
                .push(" ESCAPE '!' OR section ILIKE ")
                .push_bind(pattern.clone())
                .push(" ESCAPE '!')");
        }
    }
    if let Some(active) = &q.is_active {
        let active = active == "true";
        count_query.push(" AND \"isActive\"=").push_bind(active);
        data_query.push(" AND \"isActive\"=").push_bind(active);
    }
    if auth.0.role == "ADMIN" {
        count_query
            .push(" AND \"coordinatorId\"=")
            .push_bind(&auth.0.sub);
        data_query
            .push(" AND \"coordinatorId\"=")
            .push_bind(&auth.0.sub);
    }
    let total: i64 = count_query
        .build()
        .fetch_one(&state.db)
        .await?
        .try_get("c")
        .unwrap_or(0);
    let rows = data_query
        .push(" ORDER BY \"createdAt\" DESC LIMIT ")
        .push_bind(ps)
        .push(" OFFSET ")
        .push_bind(skip)
        .build()
        .fetch_all(&state.db)
        .await?;
    let batch_ids: Vec<String> = rows
        .iter()
        .filter_map(|r| r.try_get::<String, _>("id").ok())
        .collect();
    let coord_ids: Vec<String> = rows
        .iter()
        .filter_map(|r| r.try_get::<String, _>("coordinatorId").ok())
        .collect();
    let mut coords_by_id: std::collections::HashMap<String, serde_json::Value> =
        std::collections::HashMap::new();
    if !coord_ids.is_empty() {
        for c in sqlx::query("SELECT id,\"fullName\",email FROM \"User\" WHERE id = ANY($1)")
            .bind(&coord_ids)
            .fetch_all(&state.db)
            .await?
        {
            let id: String = c.try_get("id").unwrap_or_default();
            coords_by_id.insert(
                id.clone(),
                json!({
                    "id": id,
                    "fullName": c.try_get::<String,_>("fullName").unwrap_or_default(),
                    "email": c.try_get::<String,_>("email").unwrap_or_default(),
                }),
            );
        }
    }
    let mut students_by_batch: std::collections::HashMap<String, Vec<serde_json::Value>> =
        std::collections::HashMap::new();
    if !batch_ids.is_empty() {
        for s in sqlx::query("SELECT id,\"batchId\",\"studentIdNo\",\"fullName\" FROM \"User\" WHERE \"batchId\" = ANY($1) ORDER BY \"fullName\" ASC")
            .bind(&batch_ids)
            .fetch_all(&state.db)
            .await?
        {
            let bid: String = s.try_get("batchId").unwrap_or_default();
            students_by_batch.entry(bid).or_default().push(json!({
                "id": s.try_get::<String,_>("id").unwrap_or_default(),
                "studentIdNo": s.try_get::<Option<String>,_>("studentIdNo").unwrap_or(None),
                "fullName": s.try_get::<String,_>("fullName").unwrap_or_default(),
            }));
        }
    }
    let mut items = Vec::with_capacity(rows.len());
    for r in rows {
        let batch_id: String = r.try_get("id")?;
        let coordinator_id: String = r.try_get("coordinatorId")?;
        let coordinator = coords_by_id.get(&coordinator_id).cloned();
        let students = students_by_batch.remove(&batch_id).unwrap_or_default();
        items.push(json!({
            "id": batch_id,
            "name": r.try_get::<String,_>("name").unwrap_or_default(),
            "section": r.try_get::<String,_>("section").unwrap_or_default(),
            "academicYear": r.try_get::<String,_>("academicYear").unwrap_or_default(),
            "isActive": r.try_get::<bool,_>("isActive").unwrap_or(true),
            "coordinatorId": coordinator_id,
            "createdAt": r.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
            "updatedAt": r.try_get::<chrono::DateTime<Utc>,_>("updatedAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
            "coordinator": coordinator,
            "students": students,
        }));
    }
    Ok(Json(
        json!({"data": items, "total": total, "page": page, "pageSize": ps, "totalPages": (total as f64 / ps as f64).ceil() as i64}),
    ))
}

#[derive(Deserialize)]
struct BatchCreateInput {
    name: String,
    section: String,
    #[serde(rename = "academicYear")]
    academic_year: String,
    #[serde(rename = "coordinatorId")]
    coordinator_id: Option<String>,
}

async fn batches_create(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<serde_json::Value>,
) -> Result<Response> {
    if !["ADMIN", "SUPERADMIN"].contains(&auth.0.role.as_str()) {
        return Err(AppError::Forbidden);
    }
    if body.get("batch").is_some() {
        let batch = body
            .get("batch")
            .ok_or_else(|| AppError::BadRequest("Invalid batch.".into()))?;
        let schedule = body
            .get("schedule")
            .ok_or_else(|| AppError::BadRequest("Invalid schedule.".into()))?;
        let name = batch
            .get("name")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .trim();
        let section = batch
            .get("section")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .trim();
        let academic_year = batch
            .get("academicYear")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .trim();
        let label = schedule
            .get("label")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .trim();
        let start_time = schedule
            .get("startTime")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default();
        let end_time = schedule
            .get("endTime")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default();
        if name.chars().count() < 2
            || section.is_empty()
            || academic_year.is_empty()
            || label.is_empty()
            || start_time.is_empty()
            || end_time.is_empty()
        {
            return Err(AppError::BadRequest("Invalid batch or schedule.".into()));
        }
        if batch
            .get("isActive")
            .is_some_and(|value| !value.is_boolean())
            || batch
                .get("coordinatorId")
                .is_some_and(|value| !value.is_string())
            || schedule
                .get("graceMinutes")
                .is_some_and(|value| value.as_i64().is_none())
        {
            return Err(AppError::BadRequest("Invalid batch or schedule.".into()));
        }
        if sqlx::query("SELECT id FROM \"Batch\" WHERE name=$1")
            .bind(name)
            .fetch_optional(&state.db)
            .await?
            .is_some()
        {
            return Err(AppError::Conflict(
                "A batch with this name already exists".into(),
            ));
        }
        let requested_coordinator = batch
            .get("coordinatorId")
            .and_then(serde_json::Value::as_str);
        let coordinator_id = if auth.0.role == "ADMIN" {
            auth.0.sub.as_str()
        } else {
            requested_coordinator.unwrap_or(&auth.0.sub)
        };
        let is_active = batch
            .get("isActive")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(true);
        let grace = schedule
            .get("graceMinutes")
            .and_then(serde_json::Value::as_i64);
        if grace.is_some_and(|value| !(0..=i32::MAX as i64).contains(&value)) {
            return Err(AppError::BadRequest("Invalid graceMinutes".into()));
        }
        let grace_minutes = grace.unwrap_or(15) as i32;
        let mut tx = state.db.begin().await?;
        let batch_id = uuid::Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO \"Batch\" (id,name,section,\"academicYear\",\"isActive\",\"coordinatorId\",\"createdAt\",\"updatedAt\") VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())")
            .bind(&batch_id).bind(name).bind(section).bind(academic_year).bind(is_active).bind(coordinator_id).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO \"Schedule\" (id,\"batchId\",label,\"startTime\",\"endTime\",\"graceMinutes\",\"isActive\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,true,NOW())")
            .bind(uuid::Uuid::new_v4().to_string()).bind(&batch_id).bind(label).bind(start_time).bind(end_time).bind(grace_minutes).execute(&mut *tx).await?;
        if body
            .get("students")
            .is_some_and(|students| !students.is_array())
        {
            return Err(AppError::BadRequest("Invalid batch.".into()));
        }
        if let Some(students) = body.get("students").and_then(serde_json::Value::as_array) {
            for student in students {
                let email = student
                    .get("email")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default();
                let student_id_no = student
                    .get("studentIdNo")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default();
                let full_name = student
                    .get("fullName")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or_default();
                if !email.validate_email()
                    || student_id_no.is_empty()
                    || full_name.chars().count() < 2
                {
                    return Err(AppError::BadRequest("Invalid student.".into()));
                }
                for key in ["program", "section"] {
                    if student.get(key).is_some_and(|value| !value.is_string()) {
                        return Err(AppError::BadRequest("Invalid student.".into()));
                    }
                }
                let existing = sqlx::query(
                    "SELECT u.id, u.role::text AS role, b.\"coordinatorId\" AS coord FROM \"User\" u LEFT JOIN \"Batch\" b ON b.id=u.\"batchId\" WHERE u.email=$1",
                )
                .bind(email)
                .fetch_optional(&mut *tx)
                .await?;
                if let Some(existing) = existing {
                    let id: String = existing.try_get("id")?;
                    let role: String = existing.try_get("role")?;
                    let coord: Option<String> = existing.try_get("coord").unwrap_or(None);
                    if role != "STUDENT" {
                        return Err(AppError::Forbidden);
                    }
                    if auth.0.role == "ADMIN"
                        && coord.is_some()
                        && coord.as_deref() != Some(auth.0.sub.as_str())
                    {
                        return Err(AppError::Forbidden);
                    }
                    sqlx::query(
                        "UPDATE \"User\" SET \"batchId\"=$1,\"updatedAt\"=NOW() WHERE id=$2",
                    )
                    .bind(&batch_id)
                    .bind(id)
                    .execute(&mut *tx)
                    .await?;
                } else {
                    let required_hours: f64 = sqlx::query_scalar(
                        "SELECT \"requiredPreOjtHours\" FROM \"SystemConfig\" WHERE id='singleton'",
                    )
                    .fetch_optional(&mut *tx)
                    .await?
                    .unwrap_or(100.0);
                    sqlx::query("INSERT INTO \"User\" (id,email,\"passwordHash\",\"fullName\",role,status,\"studentIdNo\",program,section,\"batchId\",\"requiredHours\",\"createdAt\",\"updatedAt\") VALUES ($1,$2,'',$3,'STUDENT','PENDING_VERIFICATION',$4,$5,$6,$7,$8,NOW(),NOW())")
                        .bind(uuid::Uuid::new_v4().to_string()).bind(email).bind(full_name.trim()).bind(student_id_no).bind(student.get("program").and_then(serde_json::Value::as_str)).bind(student.get("section").and_then(serde_json::Value::as_str)).bind(&batch_id).bind(required_hours).execute(&mut *tx).await?;
                }
            }
        }
        tx.commit().await?;
        crate::audit::write_audit_log(
            &state,
            Some(&auth.0.sub),
            "BATCH_CREATED",
            "Batch",
            &batch_id,
            json!({"name": name, "coordinatorId": coordinator_id}),
        )
        .await?;
        let created = sqlx::query("SELECT id,name,section,\"academicYear\",\"isActive\",\"coordinatorId\",\"createdAt\"::timestamptz,\"updatedAt\"::timestamptz FROM \"Batch\" WHERE id=$1").bind(&batch_id).fetch_one(&state.db).await?;
        return Ok((
            StatusCode::CREATED,
            Json(json!({"batch": batch_json(&created)})),
        )
            .into_response());
    }
    let input: BatchCreateInput =
        serde_json::from_value(body).map_err(|_| AppError::BadRequest("Invalid batch.".into()))?;
    if input.name.trim().is_empty()
        || input.section.trim().is_empty()
        || input.academic_year.trim().is_empty()
    {
        return Err(AppError::BadRequest("Invalid batch.".into()));
    }
    if sqlx::query("SELECT id FROM \"Batch\" WHERE name=$1")
        .bind(input.name.trim())
        .fetch_optional(&state.db)
        .await?
        .is_some()
    {
        return Err(AppError::Conflict(
            "A batch with this name already exists".into(),
        ));
    }
    let coord = input
        .coordinator_id
        .clone()
        .unwrap_or_else(|| auth.0.sub.clone());
    if auth.0.role == "ADMIN" && coord != auth.0.sub {
        return Err(AppError::Forbidden);
    }
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO \"Batch\" (id,name,section,\"academicYear\",\"isActive\",\"coordinatorId\",\"createdAt\",\"updatedAt\") VALUES ($1,$2,$3,$4,true,$5,NOW(),NOW())")
        .bind(&id).bind(input.name.trim()).bind(input.section.trim()).bind(input.academic_year.trim()).bind(&coord).execute(&state.db).await?;
    crate::audit::write_audit_log(
        &state,
        Some(&auth.0.sub),
        "BATCH_CREATED",
        "Batch",
        &id,
        json!({"name": input.name, "coordinatorId": coord}),
    )
    .await?;
    let created = sqlx::query("SELECT id,name,section,\"academicYear\",\"isActive\",\"coordinatorId\",\"createdAt\"::timestamptz,\"updatedAt\"::timestamptz FROM \"Batch\" WHERE id=$1").bind(&id).fetch_one(&state.db).await?;
    Ok((
        StatusCode::CREATED,
        Json(json!({"batch": batch_json(&created)})),
    )
        .into_response())
}

fn batch_json(row: &sqlx::postgres::PgRow) -> serde_json::Value {
    json!({
        "id": row.try_get::<String,_>("id").unwrap_or_default(),
        "name": row.try_get::<String,_>("name").unwrap_or_default(),
        "section": row.try_get::<String,_>("section").unwrap_or_default(),
        "academicYear": row.try_get::<String,_>("academicYear").unwrap_or_default(),
        "isActive": row.try_get::<bool,_>("isActive").unwrap_or(true),
        "coordinatorId": row.try_get::<String,_>("coordinatorId").unwrap_or_default(),
        "createdAt": row.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
        "updatedAt": row.try_get::<chrono::DateTime<Utc>,_>("updatedAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
    })
}

async fn batches_patch(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>> {
    if !["ADMIN", "SUPERADMIN"].contains(&auth.0.role.as_str()) {
        return Err(AppError::Forbidden);
    }
    let existing = sqlx::query("SELECT \"coordinatorId\" FROM \"Batch\" WHERE id=$1")
        .bind(&id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
    let coordinator_id: String = existing.try_get("coordinatorId")?;
    if auth.0.role == "ADMIN" && coordinator_id != auth.0.sub {
        return Err(AppError::Forbidden);
    }
    #[derive(Deserialize)]
    struct B {
        name: Option<String>,
        section: Option<String>,
        #[serde(rename = "academicYear")]
        academic_year: Option<String>,
        #[serde(rename = "isActive")]
        is_active: Option<bool>,
        #[serde(rename = "coordinatorId")]
        coordinator_id: Option<String>,
    }
    let b: B =
        serde_json::from_value(body).map_err(|_| AppError::BadRequest("Invalid batch.".into()))?;
    let mut tx = state.db.begin().await?;
    if let Some(n) = &b.name {
        let trimmed = n.trim();
        if trimmed.chars().count() < 2 {
            return Err(AppError::BadRequest("Batch name is required".into()));
        }
        if sqlx::query("SELECT id FROM \"Batch\" WHERE name=$1 AND id<>$2")
            .bind(trimmed)
            .bind(&id)
            .fetch_optional(&mut *tx)
            .await?
            .is_some()
        {
            return Err(AppError::Conflict(
                "A batch with this name already exists".into(),
            ));
        }
        sqlx::query("UPDATE \"Batch\" SET name=$1,\"updatedAt\"=NOW() WHERE id=$2")
            .bind(trimmed)
            .bind(&id)
            .execute(&mut *tx)
            .await?;
    }
    if let Some(s) = &b.section {
        let trimmed = s.trim();
        if trimmed.is_empty() {
            return Err(AppError::BadRequest("Section is required".into()));
        }
        sqlx::query("UPDATE \"Batch\" SET section=$1,\"updatedAt\"=NOW() WHERE id=$2")
            .bind(trimmed)
            .bind(&id)
            .execute(&mut *tx)
            .await?;
    }
    if let Some(a) = &b.academic_year {
        let trimmed = a.trim();
        if trimmed.is_empty() {
            return Err(AppError::BadRequest("Academic year is required".into()));
        }
        sqlx::query("UPDATE \"Batch\" SET \"academicYear\"=$1,\"updatedAt\"=NOW() WHERE id=$2")
            .bind(trimmed)
            .bind(&id)
            .execute(&mut *tx)
            .await?;
    }
    if let Some(v) = b.is_active {
        sqlx::query("UPDATE \"Batch\" SET \"isActive\"=$1,\"updatedAt\"=NOW() WHERE id=$2")
            .bind(v)
            .bind(&id)
            .execute(&mut *tx)
            .await?;
    }
    if let Some(c) = &b.coordinator_id {
        if auth.0.role == "ADMIN" && c != &auth.0.sub {
            return Err(AppError::Forbidden);
        }
        sqlx::query("UPDATE \"Batch\" SET \"coordinatorId\"=$1,\"updatedAt\"=NOW() WHERE id=$2")
            .bind(c)
            .bind(&id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    crate::audit::write_audit_log(&state, Some(&auth.0.sub), "BATCH_UPDATED", "Batch", &id, json!({"name": b.name, "section": b.section, "academicYear": b.academic_year, "isActive": b.is_active})).await?;
    let updated = sqlx::query("SELECT id,name,section,\"academicYear\",\"isActive\",\"coordinatorId\",\"createdAt\"::timestamptz,\"updatedAt\"::timestamptz FROM \"Batch\" WHERE id=$1").bind(&id).fetch_one(&state.db).await?;
    Ok(Json(json!({"batch": batch_json(&updated)})))
}
