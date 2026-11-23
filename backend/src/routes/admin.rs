use crate::error::{AppError, Result};
use crate::middleware::AuthUser;
use crate::state::AppState;
use axum::body::Body;
use axum::extract::{Path, Query, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, patch, post};
use axum::{Json, Router};
use chrono::Utc;
use serde::Deserialize;
use serde_json::json;
use sqlx::Row;

#[derive(Deserialize, Default)]
struct PageQ {
    page: Option<i64>,
    #[serde(rename = "pageSize")]
    page_size: Option<i64>,
    search: Option<String>,
}

#[derive(Deserialize, Default)]
struct ReportsQuery {
    #[serde(rename = "type")]
    report_type: Option<String>,
    batch_id: Option<String>,
    section: Option<String>,
    program: Option<String>,
    status: Option<String>,
    date_from: Option<String>,
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

fn norm(page: Option<i64>, ps: Option<i64>) -> (i64, i64, i64) {
    let page = page.unwrap_or(1).max(1);
    let mut p = ps.unwrap_or(15);
    if ![15, 25, 50].contains(&p) {
        p = 15;
    }
    (page, p, (page - 1) * p)
}

async fn reports(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<ReportsQuery>,
) -> Result<Response> {
    if !["ADMIN", "SUPERADMIN"].contains(&auth.0.role.as_str()) {
        return Err(AppError::Forbidden);
    }
    let (page, page_size, skip) = norm(q.page, q.page_size);
    let kind = q.report_type.clone().unwrap_or_else(|| "attendance".into());
    let fmt = q
        .format
        .clone()
        .unwrap_or_else(|| "json".into())
        .to_ascii_lowercase();

    // role scoping: ADMIN sees only their coordinated batches / created tasks
    let admin_scope = auth.0.role == "ADMIN";

    let rows: Vec<Vec<String>> = match kind.as_str() {
        "task-progress" => {
            let mut sql = String::from(
                "SELECT COALESCE(b.name,'') AS batch, '' AS section, 'Task Progress' AS metric, \
                 a.status::text AS value, u.\"fullName\" || ' - ' || t.title AS label \
                 FROM \"TaskAssignment\" a \
                 JOIN \"Task\" t ON t.id=a.\"taskId\" \
                 JOIN \"User\" u ON u.id=a.\"studentId\" \
                 LEFT JOIN \"Batch\" b ON b.id=t.\"batchId\" WHERE 1=1",
            );
            if admin_scope {
                sql.push_str(" AND t.\"createdById\"=$1");
            }
            if let Some(s) = &q.status {
                if !s.is_empty() {
                    sql.push_str(&format!(" AND a.status::text='{}'", s.replace('\'', "''")));
                }
            }
            if let Some(bid) = &q.batch_id {
                sql.push_str(&format!(" AND t.\"batchId\"='{}'", bid.replace('\'', "''")));
            }
            sql.push_str(&format!(
                " ORDER BY a.\"createdAt\" DESC LIMIT {} OFFSET {}",
                page_size, skip
            ));
            let r = if admin_scope {
                sqlx::query(&sql)
                    .bind(&auth.0.sub)
                    .fetch_all(&state.db)
                    .await?
            } else {
                sqlx::query(&sql).fetch_all(&state.db).await?
            };
            r.into_iter()
                .map(|row| {
                    (0..5)
                        .map(|i| {
                            let key = match i {
                                0 => "batch",
                                1 => "section",
                                2 => "metric",
                                3 => "value",
                                _ => "label",
                            };
                            row.try_get::<String, _>(key).unwrap_or_default()
                        })
                        .collect()
                })
                .collect()
        }
        "lab-equipment" => {
            let mut sql = String::from(
                "SELECT '' AS batch, '' AS section, 'Lab Equipment' AS metric, \
                 u.condition::text AS value, r.name || ' - ' || u.\"unitCode\" AS label \
                 FROM \"LabRoom\" r JOIN \"ComputerUnit\" u ON u.\"roomId\"=r.id WHERE 1=1",
            );
            if admin_scope {
                sql.push_str(" AND (r.\"assignedAdminId\"=$1 OR r.\"assignedAdminId\" IS NULL)");
            }
            sql.push_str(&format!(
                " ORDER BY r.name ASC LIMIT {} OFFSET {}",
                page_size, skip
            ));
            let r = if admin_scope {
                sqlx::query(&sql)
                    .bind(&auth.0.sub)
                    .fetch_all(&state.db)
                    .await?
            } else {
                sqlx::query(&sql).fetch_all(&state.db).await?
            };
            r.into_iter()
                .map(|row| {
                    (0..5)
                        .map(|i| {
                            let key = match i {
                                0 => "batch",
                                1 => "section",
                                2 => "metric",
                                3 => "value",
                                _ => "label",
                            };
                            row.try_get::<String, _>(key).unwrap_or_default()
                        })
                        .collect()
                })
                .collect()
        }
        _ => {
            // attendance / duty-hours / default
            let mut sql = String::from(
                "SELECT b.name AS batch, b.section AS section, 'Attendance' AS metric, \
                 a.\"recordedHours\"::text AS value, a.status::text || ' - ' || u.\"fullName\" AS label \
                 FROM \"AttendanceLog\" a \
                 JOIN \"Batch\" b ON b.id=a.\"batchId\" \
                 JOIN \"User\" u ON u.id=a.\"studentId\" WHERE 1=1",
            );
            if admin_scope {
                sql.push_str(" AND b.\"coordinatorId\"=$1");
            }
            if let Some(bid) = &q.batch_id {
                sql.push_str(&format!(" AND a.\"batchId\"='{}'", bid.replace('\'', "''")));
            }
            if let Some(s) = &q.section {
                if !s.is_empty() {
                    sql.push_str(&format!(" AND u.section='{}'", s.replace('\'', "''")));
                }
            }
            if let Some(p) = &q.program {
                if !p.is_empty() {
                    sql.push_str(&format!(" AND u.program='{}'", p.replace('\'', "''")));
                }
            }
            if let Some(s) = &q.status {
                if !s.is_empty() {
                    sql.push_str(&format!(" AND a.status::text='{}'", s.replace('\'', "''")));
                }
            }
            if let Some(d) = &q.date_from {
                if !d.is_empty() {
                    sql.push_str(&format!(
                        " AND a.\"shiftDate\" >= '{}'::date",
                        d.replace('\'', "''")
                    ));
                }
            }
            if let Some(d) = &q.date_to {
                if !d.is_empty() {
                    sql.push_str(&format!(
                        " AND a.\"shiftDate\" <= '{}'::date",
                        d.replace('\'', "''")
                    ));
                }
            }
            sql.push_str(&format!(
                " ORDER BY a.\"shiftDate\" DESC LIMIT {} OFFSET {}",
                page_size, skip
            ));
            let r = if admin_scope {
                sqlx::query(&sql)
                    .bind(&auth.0.sub)
                    .fetch_all(&state.db)
                    .await?
            } else {
                sqlx::query(&sql).fetch_all(&state.db).await?
            };
            r.into_iter()
                .map(|row| {
                    (0..5)
                        .map(|i| {
                            let key = match i {
                                0 => "batch",
                                1 => "section",
                                2 => "metric",
                                3 => "value",
                                _ => "label",
                            };
                            row.try_get::<String, _>(key).unwrap_or_default()
                        })
                        .collect()
                })
                .collect()
        }
    };

    let total: i64 = rows.len() as i64; // limited page total
    let filename = format!("operational-report-{}", kind);

    if fmt == "csv" {
        let mut csv = String::new();
        if !rows.is_empty() {
            csv.push_str("batch,section,metric,value,label\n");
            for row in &rows {
                let cells: Vec<String> = row.iter().map(|c| csv_cell(c)).collect();
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
            &format!("Operational Report — {}", kind),
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

async fn students_list(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<PageQ>,
) -> Result<Json<serde_json::Value>> {
    if !["ADMIN", "SUPERADMIN"].contains(&auth.0.role.as_str()) {
        return Err(AppError::Forbidden);
    }
    let (page, ps, skip) = norm(q.page, q.page_size);
    let search = q.search.clone().unwrap_or_default();
    let mut cond = Vec::new();
    if auth.0.role == "ADMIN" {
        cond.push(format!(
            "u.\"batch\".\"coordinatorId\"='{}'",
            auth.0.sub.replace('\'', "''")
        ));
    }
    // simpler: filter by batch coordinator via join
    let mut where_sql = String::from("WHERE u.role='STUDENT'");
    if !search.is_empty() {
        where_sql.push_str(&format!(
            " AND u.\"fullName\" ILIKE '%{}%'",
            search.replace('\'', "''").replace('%', "\\%")
        ));
    }
    if auth.0.role == "ADMIN" {
        where_sql.push_str(&format!(
            " AND u.\"batchId\" IN (SELECT id FROM \"Batch\" WHERE \"coordinatorId\"='{}')",
            auth.0.sub.replace('\'', "''")
        ));
    }
    let total: i64 = sqlx::query(&format!(
        "SELECT COUNT(*) as c FROM \"User\" u {}",
        where_sql
    ))
    .fetch_one(&state.db)
    .await?
    .try_get("c")
    .unwrap_or(0);
    let rows = sqlx::query(&format!("SELECT u.id,u.email,u.\"fullName\",u.\"studentIdNo\",u.program,u.section,u.status::text,u.\"batchId\" FROM \"User\" u {} ORDER BY u.\"fullName\" ASC LIMIT {} OFFSET {}", where_sql, ps, skip))
        .fetch_all(&state.db).await?;
    let items: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|r| {
            json!({
                "id": r.try_get::<String,_>("id").unwrap_or_default(),
                "email": r.try_get::<String,_>("email").unwrap_or_default(),
                "fullName": r.try_get::<String,_>("fullName").unwrap_or_default(),
                "studentIdNo": r.try_get::<Option<String>,_>("studentIdNo").unwrap_or(None),
                "program": r.try_get::<Option<String>,_>("program").unwrap_or(None),
                "section": r.try_get::<Option<String>,_>("section").unwrap_or(None),
                "status": r.try_get::<String,_>("status").unwrap_or_default(),
                "batchId": r.try_get::<Option<String>,_>("batchId").unwrap_or(None),
            })
        })
        .collect();
    Ok(Json(
        json!({"items": items, "total": total, "page": page, "pageSize": ps}),
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
    #[derive(Deserialize)]
    struct B {
        id: String,
        status: Option<String>,
        program: Option<String>,
        section: Option<String>,
        #[serde(rename = "batchId")]
        batch_id: Option<String>,
    }
    let b: B =
        serde_json::from_value(body).map_err(|_| AppError::BadRequest("Invalid input".into()))?;
    if auth.0.role == "ADMIN" {
        let row = sqlx::query(
            "SELECT b.\"coordinatorId\" FROM \"User\" u LEFT JOIN \"Batch\" b ON u.\"batchId\"=b.id WHERE u.id=$1",
        )
        .bind(&b.id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
        let coord: Option<String> = row.try_get("coordinatorId").ok();
        if coord.as_deref() != Some(auth.0.sub.as_str()) {
            return Err(AppError::Forbidden);
        }
        if let Some(new_bid) = &b.batch_id {
            let brow = sqlx::query("SELECT \"coordinatorId\" FROM \"Batch\" WHERE id=$1")
                .bind(new_bid)
                .fetch_optional(&state.db)
                .await?
                .ok_or(AppError::NotFound)?;
            let new_coord: String = brow.try_get("coordinatorId")?;
            if new_coord != auth.0.sub {
                return Err(AppError::Forbidden);
            }
        }
    }
    if let Some(s) = &b.status {
        sqlx::query("UPDATE \"User\" SET status=$1,\"updatedAt\"=NOW() WHERE id=$2")
            .bind(s)
            .bind(&b.id)
            .execute(&state.db)
            .await?;
    }
    if let Some(p) = &b.program {
        sqlx::query("UPDATE \"User\" SET program=$1,\"updatedAt\"=NOW() WHERE id=$2")
            .bind(p)
            .bind(&b.id)
            .execute(&state.db)
            .await?;
    }
    if let Some(s) = &b.section {
        sqlx::query("UPDATE \"User\" SET section=$1,\"updatedAt\"=NOW() WHERE id=$2")
            .bind(s)
            .bind(&b.id)
            .execute(&state.db)
            .await?;
    }
    if let Some(bid) = &b.batch_id {
        sqlx::query("UPDATE \"User\" SET \"batchId\"=$1,\"updatedAt\"=NOW() WHERE id=$2")
            .bind(bid)
            .bind(&b.id)
            .execute(&state.db)
            .await?;
    }
    Ok(Json(json!({"message": "Student updated."})))
}

async fn batches_list(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<PageQ>,
) -> Result<Json<serde_json::Value>> {
    if !["ADMIN", "SUPERADMIN"].contains(&auth.0.role.as_str()) {
        return Err(AppError::Forbidden);
    }
    let (page, ps, skip) = norm(q.page, q.page_size);
    let mut where_sql = String::new();
    if auth.0.role == "ADMIN" {
        where_sql = format!(
            "WHERE \"coordinatorId\"='{}'",
            auth.0.sub.replace('\'', "''")
        );
    }
    let total: i64 = sqlx::query(&format!(
        "SELECT COUNT(*) as c FROM \"Batch\" {}",
        where_sql
    ))
    .fetch_one(&state.db)
    .await?
    .try_get("c")
    .unwrap_or(0);
    let rows = sqlx::query(&format!("SELECT id,name,section,\"academicYear\",\"isActive\",\"coordinatorId\",\"createdAt\"::timestamptz FROM \"Batch\" {} ORDER BY name ASC LIMIT {} OFFSET {}", where_sql, ps, skip))
        .fetch_all(&state.db).await?;
    let items: Vec<serde_json::Value> = rows.into_iter().map(|r| json!({
        "id": r.try_get::<String,_>("id").unwrap_or_default(),
        "name": r.try_get::<String,_>("name").unwrap_or_default(),
        "section": r.try_get::<String,_>("section").unwrap_or_default(),
        "academicYear": r.try_get::<String,_>("academicYear").unwrap_or_default(),
        "isActive": r.try_get::<bool,_>("isActive").unwrap_or(true),
        "coordinatorId": r.try_get::<String,_>("coordinatorId").unwrap_or_default(),
        "createdAt": r.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
    })).collect();
    Ok(Json(
        json!({"items": items, "total": total, "page": page, "pageSize": ps}),
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
) -> Result<Json<serde_json::Value>> {
    if !["ADMIN", "SUPERADMIN"].contains(&auth.0.role.as_str()) {
        return Err(AppError::Forbidden);
    }
    let input: BatchCreateInput =
        serde_json::from_value(body).map_err(|_| AppError::BadRequest("Invalid batch.".into()))?;
    if input.name.trim().is_empty()
        || input.section.trim().is_empty()
        || input.academic_year.trim().is_empty()
    {
        return Err(AppError::BadRequest("Invalid batch.".into()));
    }
    let coord = input
        .coordinator_id
        .clone()
        .unwrap_or_else(|| auth.0.sub.clone());
    // if admin, coordinator must be self
    if auth.0.role == "ADMIN" && coord != auth.0.sub {
        return Err(AppError::Forbidden);
    }
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO \"Batch\" (id,name,section,\"academicYear\",\"isActive\",\"coordinatorId\",\"createdAt\",\"updatedAt\") VALUES ($1,$2,$3,$4,true,$5,NOW(),NOW())")
        .bind(&id).bind(input.name.trim()).bind(input.section.trim()).bind(input.academic_year.trim()).bind(&coord).execute(&state.db).await?;
    Ok(Json(
        json!({"batch": {"id": id, "name": input.name, "section": input.section, "academicYear": input.academic_year, "coordinatorId": coord}}),
    ))
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
    if let Some(n) = &b.name {
        sqlx::query("UPDATE \"Batch\" SET name=$1,\"updatedAt\"=NOW() WHERE id=$2")
            .bind(n)
            .bind(&id)
            .execute(&state.db)
            .await?;
    }
    if let Some(s) = &b.section {
        sqlx::query("UPDATE \"Batch\" SET section=$1,\"updatedAt\"=NOW() WHERE id=$2")
            .bind(s)
            .bind(&id)
            .execute(&state.db)
            .await?;
    }
    if let Some(a) = &b.academic_year {
        sqlx::query("UPDATE \"Batch\" SET \"academicYear\"=$1,\"updatedAt\"=NOW() WHERE id=$2")
            .bind(a)
            .bind(&id)
            .execute(&state.db)
            .await?;
    }
    if let Some(v) = b.is_active {
        sqlx::query("UPDATE \"Batch\" SET \"isActive\"=$1,\"updatedAt\"=NOW() WHERE id=$2")
            .bind(v)
            .bind(&id)
            .execute(&state.db)
            .await?;
    }
    if let Some(c) = &b.coordinator_id {
        sqlx::query("UPDATE \"Batch\" SET \"coordinatorId\"=$1,\"updatedAt\"=NOW() WHERE id=$2")
            .bind(c)
            .bind(&id)
            .execute(&state.db)
            .await?;
    }
    Ok(Json(json!({"message": "Batch updated."})))
}
