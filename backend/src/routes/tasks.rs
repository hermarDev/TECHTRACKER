use crate::error::{AppError, Result};
use crate::middleware::AuthUser;
use crate::state::AppState;
use crate::storage::{read_field_capped, sniff_mime, MAX_UPLOAD_BYTES};
use axum::extract::{Multipart, Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::Utc;
use serde::Deserialize;
use serde_json::json;
use sqlx::{QueryBuilder, Row};
use uuid::Uuid;

#[derive(Deserialize, Default)]
struct TasksQuery {
    page: Option<i64>,
    #[serde(rename = "pageSize")]
    page_size: Option<i64>,
    search: Option<String>,
    status: Option<String>,
}

const TASK_STATUSES: [&str; 5] = [
    "ASSIGNED",
    "IN_PROGRESS",
    "SUBMITTED",
    "RETURNED",
    "ACCEPTED",
];

#[derive(Deserialize)]
struct TaskCreateInput {
    title: String,
    instructions: String,
    category: Option<String>,
    #[serde(rename = "targetLab")]
    target_lab: Option<String>,
    #[serde(rename = "targetUnits")]
    target_units: Option<String>,
    deadline: String,
    #[serde(rename = "studentIds")]
    student_ids: Vec<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/tasks", get(list).post(create))
        .route("/api/tasks/:id", get(get_one))
        .route("/api/tasks/:id/start", post(start))
        .route("/api/tasks/:id/submit", post(submit))
        .route("/api/tasks/:id/review", post(review))
}

fn normalize_pagination(page: Option<i64>, page_size: Option<i64>) -> (i64, i64, i64) {
    let page = page.unwrap_or(1).max(1);
    let mut ps = page_size.unwrap_or(15);
    if ![15, 25, 50].contains(&ps) {
        ps = 15;
    }
    ((page), ps, (page - 1) * ps)
}

async fn list(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<TasksQuery>,
) -> Result<Json<serde_json::Value>> {
    if !["STUDENT", "ADMIN", "SUPERADMIN"].contains(&auth.0.role.as_str()) {
        return Err(AppError::Forbidden);
    }
    let (page, page_size, skip) = normalize_pagination(q.page, q.page_size);
    let search = q.search.as_deref().unwrap_or_default().trim().to_string();
    // Status lives on the assignment, not the task; ignore unknown values instead of failing the query.
    let status = match q.status.as_deref() {
        Some(s) if TASK_STATUSES.contains(&s) => s.to_string(),
        _ => String::new(),
    };

    let mut count_query = QueryBuilder::new("SELECT COUNT(*) as c FROM \"Task\" t WHERE TRUE");
    let mut data_query = QueryBuilder::new(
        "SELECT t.id,t.title,t.instructions,t.category,t.\"targetLab\",t.\"targetUnits\",t.deadline::timestamptz,t.\"batchId\",t.\"createdById\",t.\"createdAt\"::timestamptz,t.\"updatedAt\"::timestamptz FROM \"Task\" t WHERE TRUE",
    );
    if auth.0.role == "STUDENT" || !status.is_empty() {
        for query in [&mut count_query, &mut data_query] {
            query.push(" AND EXISTS (SELECT 1 FROM \"TaskAssignment\" ta WHERE ta.\"taskId\"=t.id");
            if auth.0.role == "STUDENT" {
                query.push(" AND ta.\"studentId\"=").push_bind(&auth.0.sub);
            }
            if !status.is_empty() {
                query.push(" AND ta.status::text=").push_bind(&status);
            }
            query.push(")");
        }
    }
    if auth.0.role == "ADMIN" {
        count_query
            .push(" AND t.\"createdById\"=")
            .push_bind(&auth.0.sub);
        data_query
            .push(" AND t.\"createdById\"=")
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
            .push(" AND t.title ILIKE ")
            .push_bind(pattern.clone())
            .push(" ESCAPE '!' ");
        data_query
            .push(" AND t.title ILIKE ")
            .push_bind(pattern.clone())
            .push(" ESCAPE '!' ");
    }

    let total: i64 = count_query
        .build()
        .fetch_one(&state.db)
        .await?
        .try_get("c")
        .unwrap_or(0);

    let rows = data_query
        .push(" ORDER BY t.\"createdAt\" DESC LIMIT ")
        .push_bind(page_size)
        .push(" OFFSET ")
        .push_bind(skip)
        .build()
        .fetch_all(&state.db)
        .await?;

    let mut items = Vec::new();
    for r in rows {
        let task_id: String = r.try_get("id")?;
        // assignments
        let assigns = if auth.0.role == "STUDENT" {
            sqlx::query("SELECT ta.id,ta.\"taskId\",ta.\"studentId\",ta.status::text,ta.\"startedAt\"::timestamptz,ta.\"acceptedAt\"::timestamptz,ta.\"createdAt\"::timestamptz,ta.\"updatedAt\"::timestamptz, u.\"fullName\",u.\"studentIdNo\" FROM \"TaskAssignment\" ta JOIN \"User\" u ON ta.\"studentId\"=u.id WHERE ta.\"taskId\"=$1 AND ta.\"studentId\"=$2")
                .bind(&task_id).bind(&auth.0.sub).fetch_all(&state.db).await.unwrap_or_default()
        } else {
            sqlx::query("SELECT ta.id,ta.\"taskId\",ta.\"studentId\",ta.status::text,ta.\"startedAt\"::timestamptz,ta.\"acceptedAt\"::timestamptz,ta.\"createdAt\"::timestamptz,ta.\"updatedAt\"::timestamptz, u.\"fullName\",u.\"studentIdNo\" FROM \"TaskAssignment\" ta JOIN \"User\" u ON ta.\"studentId\"=u.id WHERE ta.\"taskId\"=$1")
                .bind(&task_id).fetch_all(&state.db).await.unwrap_or_default()
        };
        let assignments: Vec<serde_json::Value> = assigns.into_iter().map(|a| json!({
            "id": a.try_get::<String,_>("id").unwrap_or_default(),
            "taskId": a.try_get::<String,_>("taskId").unwrap_or_default(),
            "studentId": a.try_get::<String,_>("studentId").unwrap_or_default(),
            "status": a.try_get::<String,_>("status").unwrap_or_default(),
            "startedAt": a.try_get::<Option<chrono::DateTime<Utc>>,_>("startedAt").ok().flatten().map(|d| d.to_rfc3339()),
            "acceptedAt": a.try_get::<Option<chrono::DateTime<Utc>>,_>("acceptedAt").ok().flatten().map(|d| d.to_rfc3339()),
            "createdAt": a.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
            "updatedAt": a.try_get::<chrono::DateTime<Utc>,_>("updatedAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
            "student": {
                "id": a.try_get::<String,_>("studentId").unwrap_or_default(),
                "fullName": a.try_get::<String,_>("fullName").unwrap_or_default(),
                "studentIdNo": a.try_get::<Option<String>,_>("studentIdNo").unwrap_or(None),
            }
        })).collect();

        items.push(json!({
            "id": task_id,
            "title": r.try_get::<String,_>("title").unwrap_or_default(),
            "instructions": r.try_get::<String,_>("instructions").unwrap_or_default(),
            "category": r.try_get::<String,_>("category").unwrap_or_default(),
            "targetLab": r.try_get::<Option<String>,_>("targetLab").unwrap_or(None),
            "targetUnits": r.try_get::<Option<String>,_>("targetUnits").unwrap_or(None),
            "deadline": r.try_get::<chrono::DateTime<Utc>,_>("deadline").map(|d| d.to_rfc3339()).unwrap_or_default(),
            "batchId": r.try_get::<Option<String>,_>("batchId").unwrap_or(None),
            "createdById": r.try_get::<String,_>("createdById").unwrap_or_default(),
            "createdAt": r.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
            "updatedAt": r.try_get::<chrono::DateTime<Utc>,_>("updatedAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
            "assignments": assignments,
        }));
    }

    Ok(Json(
        json!({"items": items, "total": total, "page": page, "pageSize": page_size}),
    ))
}

async fn create(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<serde_json::Value>,
) -> Result<axum::response::Response> {
    if !["ADMIN", "SUPERADMIN"].contains(&auth.0.role.as_str()) {
        return Err(AppError::Forbidden);
    }
    let input: TaskCreateInput = serde_json::from_value(body)
        .map_err(|_| AppError::BadRequest("Invalid task assignment.".into()))?;
    if input.title.trim().is_empty() || input.title.len() > 160 {
        return Err(AppError::BadRequest("Invalid task assignment.".into()));
    }
    if input.instructions.trim().is_empty() || input.instructions.trim().len() > 10000 {
        return Err(AppError::BadRequest("Invalid task assignment.".into()));
    }
    if input.student_ids.is_empty() {
        return Err(AppError::BadRequest("Invalid task assignment.".into()));
    }
    if input
        .category
        .as_deref()
        .is_some_and(|value| value.trim().is_empty() || value.trim().chars().count() > 80)
        || input
            .target_lab
            .as_deref()
            .is_some_and(|value| value.trim().chars().count() > 120)
        || input
            .target_units
            .as_deref()
            .is_some_and(|value| value.trim().chars().count() > 500)
    {
        return Err(AppError::BadRequest("Invalid task assignment.".into()));
    }
    let deadline = chrono::DateTime::parse_from_rfc3339(&input.deadline)
        .map_err(|_| AppError::BadRequest("Invalid task assignment.".into()))?;

    // validate students in scope
    let mut valid_ids: Vec<String> = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();
    for sid in &input.student_ids {
        if !seen_ids.insert(sid) {
            return Err(AppError::Forbidden);
        }
        let row = if auth.0.role == "ADMIN" {
            sqlx::query("SELECT u.id FROM \"User\" u JOIN \"Batch\" b ON u.\"batchId\"=b.id WHERE u.id=$1 AND u.role::text='STUDENT' AND u.status::text='ACTIVE' AND b.\"coordinatorId\"=$2")
                .bind(sid).bind(&auth.0.sub).fetch_optional(&state.db).await?
        } else {
            sqlx::query("SELECT id FROM \"User\" WHERE id=$1 AND role::text='STUDENT' AND status::text='ACTIVE'")
                .bind(sid).fetch_optional(&state.db).await?
        };
        if row.is_none() {
            return Err(AppError::Forbidden);
        }
        valid_ids.push(sid.clone());
    }

    let task_id = Uuid::new_v4().to_string();
    let category = input
        .category
        .map(|value| value.trim().to_string())
        .unwrap_or_else(|| "General Technical".to_string());
    let target_lab = input.target_lab.as_deref().map(str::trim);
    let target_units = input.target_units.as_deref().map(str::trim);
    // transaction: create task, assignments, notifications
    let mut tx = state.db.begin().await?;
    sqlx::query("INSERT INTO \"Task\" (id,title,instructions,category,\"targetLab\",\"targetUnits\",deadline,\"createdById\",\"createdAt\",\"updatedAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())")
        .bind(&task_id).bind(input.title.trim()).bind(input.instructions.trim()).bind(&category)
        .bind(target_lab).bind(target_units).bind(deadline.with_timezone(&Utc))
        .bind(&auth.0.sub).execute(&mut *tx).await?;
    for sid in &valid_ids {
        sqlx::query("INSERT INTO \"TaskAssignment\" (id,\"taskId\",\"studentId\",status,\"createdAt\",\"updatedAt\") VALUES ($1,$2,$3,'ASSIGNED',NOW(),NOW())")
            .bind(Uuid::new_v4().to_string()).bind(&task_id).bind(sid).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO \"Notification\" (id,\"userId\",type,title,body,link,\"isRead\",\"createdAt\") VALUES ($1,$2,'ASSIGNMENT','New task assigned',$3,$4,false,NOW())")
            .bind(Uuid::new_v4().to_string()).bind(sid).bind(input.title.trim()).bind(format!("/tasks/{}", task_id)).execute(&mut *tx).await?;
    }
    tx.commit().await?;

    let task_row = sqlx::query("SELECT id,title,instructions,category,\"targetLab\",\"targetUnits\",deadline::timestamptz,\"batchId\",\"createdById\",\"createdAt\"::timestamptz,\"updatedAt\"::timestamptz FROM \"Task\" WHERE id=$1")
        .bind(&task_id).fetch_one(&state.db).await?;
    let task = json!({
        "id": task_row.try_get::<String,_>("id").unwrap_or_default(),
        "title": task_row.try_get::<String,_>("title").unwrap_or_default(),
        "instructions": task_row.try_get::<String,_>("instructions").unwrap_or_default(),
        "category": task_row.try_get::<String,_>("category").unwrap_or_default(),
        "targetLab": task_row.try_get::<Option<String>,_>("targetLab").unwrap_or(None),
        "targetUnits": task_row.try_get::<Option<String>,_>("targetUnits").unwrap_or(None),
        "deadline": task_row.try_get::<chrono::DateTime<Utc>,_>("deadline").map(|d| d.to_rfc3339()).unwrap_or_default(),
        "batchId": task_row.try_get::<Option<String>,_>("batchId").unwrap_or(None),
        "createdById": task_row.try_get::<String,_>("createdById").unwrap_or_default(),
        "createdAt": task_row.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
        "updatedAt": task_row.try_get::<chrono::DateTime<Utc>,_>("updatedAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
    });
    Ok((StatusCode::CREATED, Json(json!({"task": task}))).into_response())
}

async fn get_one(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    if !["STUDENT", "ADMIN", "SUPERADMIN"].contains(&auth.0.role.as_str()) {
        return Err(AppError::Forbidden);
    }
    let task = sqlx::query("SELECT id,title,instructions,category,\"targetLab\",\"targetUnits\",deadline::timestamptz,\"batchId\",\"createdById\",\"createdAt\"::timestamptz,\"updatedAt\"::timestamptz FROM \"Task\" WHERE id=$1")
        .bind(&id).fetch_optional(&state.db).await?.ok_or(AppError::NotFound)?;
    let created_by: String = task.try_get("createdById")?;
    // ownership: student only own assigned tasks; admin only own created tasks; superadmin all.
    if auth.0.role == "ADMIN" && created_by != auth.0.sub {
        return Err(AppError::NotFound);
    }
    if auth.0.role == "STUDENT" {
        let assigned = sqlx::query(
            "SELECT 1 FROM \"TaskAssignment\" WHERE \"taskId\"=$1 AND \"studentId\"=$2",
        )
        .bind(&id)
        .bind(&auth.0.sub)
        .fetch_optional(&state.db)
        .await?;
        if assigned.is_none() {
            return Err(AppError::NotFound);
        }
    }
    // assignments with student, submissions, remarks
    let assigns = sqlx::query("SELECT ta.id,ta.\"taskId\",ta.\"studentId\",ta.status::text,ta.\"startedAt\"::timestamptz,ta.\"acceptedAt\"::timestamptz,ta.\"createdAt\"::timestamptz,ta.\"updatedAt\"::timestamptz, u.\"fullName\",u.\"studentIdNo\" FROM \"TaskAssignment\" ta JOIN \"User\" u ON ta.\"studentId\"=u.id WHERE ta.\"taskId\"=$1")
        .bind(&id).fetch_all(&state.db).await.unwrap_or_default();

    let mut assignments = Vec::new();
    for a in assigns {
        let aid: String = a.try_get("id")?;
        // remarks
        let remarks = sqlx::query("SELECT tr.id,tr.\"assignmentId\",tr.\"authorId\",tr.visibility::text,tr.body,tr.\"createdAt\"::timestamptz,u.\"fullName\" AS \"authorFullName\" FROM \"TaskRemark\" tr LEFT JOIN \"User\" u ON u.id=tr.\"authorId\" WHERE tr.\"assignmentId\"=$1 ORDER BY tr.\"createdAt\"::timestamptz ASC")
            .bind(&aid).fetch_all(&state.db).await.unwrap_or_default();
        let remarks_json: Vec<serde_json::Value> = remarks.into_iter().map(|rm| json!({
            "id": rm.try_get::<String,_>("id").unwrap_or_default(),
            "assignmentId": rm.try_get::<String,_>("assignmentId").unwrap_or_default(),
            "authorId": rm.try_get::<String,_>("authorId").unwrap_or_default(),
            "author": {
                "id": rm.try_get::<String,_>("authorId").unwrap_or_default(),
                "fullName": rm.try_get::<Option<String>,_>("authorFullName").ok().flatten().unwrap_or_else(|| "Coordinator".to_string()),
            },
            "visibility": rm.try_get::<String,_>("visibility").unwrap_or_default(),
            "body": rm.try_get::<String,_>("body").unwrap_or_default(),
            "createdAt": rm.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
        })).collect();
        // submissions
        let subs = sqlx::query("SELECT id,\"assignmentId\",version,summary,\"attachmentKeys\",\"submittedAt\"::timestamptz FROM \"TaskSubmission\" WHERE \"assignmentId\"=$1 ORDER BY version DESC")
            .bind(&aid).fetch_all(&state.db).await.unwrap_or_default();
        let subs_json: Vec<serde_json::Value> = subs.into_iter().map(|s| json!({
            "id": s.try_get::<String,_>("id").unwrap_or_default(),
            "assignmentId": s.try_get::<String,_>("assignmentId").unwrap_or_default(),
            "version": s.try_get::<i32,_>("version").unwrap_or(0),
            "summary": s.try_get::<String,_>("summary").unwrap_or_default(),
            "attachmentKeys": s.try_get::<serde_json::Value,_>("attachmentKeys").unwrap_or(json!([])),
            "submittedAt": s.try_get::<chrono::DateTime<Utc>,_>("submittedAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
        })).collect();

        let student_id: String = a.try_get("studentId")?;
        // student scope filtering
        if auth.0.role == "STUDENT" && student_id != auth.0.sub {
            continue;
        }

        // filter remarks visibility for students
        let remarks_filtered = if auth.0.role == "STUDENT" {
            remarks_json
                .into_iter()
                .filter(|r| r.get("visibility").and_then(|v| v.as_str()) == Some("STUDENT_VISIBLE"))
                .collect()
        } else {
            remarks_json
        };

        assignments.push(json!({
            "id": aid,
            "taskId": a.try_get::<String,_>("taskId").unwrap_or_default(),
            "studentId": student_id,
            "status": a.try_get::<String,_>("status").unwrap_or_default(),
            "startedAt": a.try_get::<Option<chrono::DateTime<Utc>>,_>("startedAt").ok().flatten().map(|d| d.to_rfc3339()),
            "acceptedAt": a.try_get::<Option<chrono::DateTime<Utc>>,_>("acceptedAt").ok().flatten().map(|d| d.to_rfc3339()),
            "createdAt": a.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
            "updatedAt": a.try_get::<chrono::DateTime<Utc>,_>("updatedAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
            "student": {
                "id": student_id,
                "fullName": a.try_get::<String,_>("fullName").unwrap_or_default(),
                "studentIdNo": a.try_get::<Option<String>,_>("studentIdNo").unwrap_or(None),
            },
            "submissions": subs_json,
            "remarks": remarks_filtered,
        }));
    }

    if assignments.is_empty() {
        return Err(AppError::NotFound);
    }

    let task_json = json!({
        "id": task.try_get::<String,_>("id").unwrap_or_default(),
        "title": task.try_get::<String,_>("title").unwrap_or_default(),
        "instructions": task.try_get::<String,_>("instructions").unwrap_or_default(),
        "category": task.try_get::<String,_>("category").unwrap_or_default(),
        "targetLab": task.try_get::<Option<String>,_>("targetLab").unwrap_or(None),
        "targetUnits": task.try_get::<Option<String>,_>("targetUnits").unwrap_or(None),
        "deadline": task.try_get::<chrono::DateTime<Utc>,_>("deadline").map(|d| d.to_rfc3339()).unwrap_or_default(),
        "batchId": task.try_get::<Option<String>,_>("batchId").unwrap_or(None),
        "createdById": task.try_get::<String,_>("createdById").unwrap_or_default(),
        "createdAt": task.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
        "updatedAt": task.try_get::<chrono::DateTime<Utc>,_>("updatedAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
        "assignments": assignments,
    });
    Ok(Json(json!({"task": task_json})))
}

async fn start(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>> {
    if auth.0.role != "STUDENT" {
        return Err(AppError::Forbidden);
    }
    // find assignment
    let assign = sqlx::query(
        "SELECT id,status::text FROM \"TaskAssignment\" WHERE \"taskId\"=$1 AND \"studentId\"=$2",
    )
    .bind(&id)
    .bind(&auth.0.sub)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    let aid: String = assign.try_get("id")?;
    // conditional update prevents concurrent starts (only ASSIGNED/RETURNED may start)
    let res = sqlx::query(
        "UPDATE \"TaskAssignment\" SET status='IN_PROGRESS',\"startedAt\"=COALESCE(\"startedAt\",NOW()),\"updatedAt\"=NOW() WHERE id=$1 AND status IN ('ASSIGNED','RETURNED')",
    )
    .bind(&aid)
    .execute(&state.db)
    .await?;
    if res.rows_affected() == 0 {
        return Err(AppError::Conflict(
            "Task cannot be started in its current state.".into(),
        ));
    }
    let updated = sqlx::query("SELECT id,\"taskId\",\"studentId\",status::text,\"startedAt\"::timestamptz,\"acceptedAt\"::timestamptz,\"createdAt\"::timestamptz,\"updatedAt\"::timestamptz FROM \"TaskAssignment\" WHERE id=$1")
        .bind(&aid).fetch_one(&state.db).await?;
    Ok(Json(json!({"assignment": assignment_json(&updated)})))
}

fn assignment_json(row: &sqlx::postgres::PgRow) -> serde_json::Value {
    json!({
        "id": row.try_get::<String,_>("id").unwrap_or_default(),
        "taskId": row.try_get::<String,_>("taskId").unwrap_or_default(),
        "studentId": row.try_get::<String,_>("studentId").unwrap_or_default(),
        "status": row.try_get::<String,_>("status").unwrap_or_default(),
        "startedAt": row.try_get::<Option<chrono::DateTime<Utc>>,_>("startedAt").ok().flatten().map(|d| d.to_rfc3339()),
        "acceptedAt": row.try_get::<Option<chrono::DateTime<Utc>>,_>("acceptedAt").ok().flatten().map(|d| d.to_rfc3339()),
        "createdAt": row.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
        "updatedAt": row.try_get::<chrono::DateTime<Utc>,_>("updatedAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
    })
}

async fn submit(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
    mut multipart: Multipart,
) -> Result<axum::response::Response> {
    if auth.0.role != "STUDENT" {
        return Err(AppError::Forbidden);
    }
    let mut summary: Option<String> = None;
    let mut keys: Vec<String> = Vec::new();
    while let Some(mut field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let name = field.name().unwrap_or("").to_string();
        if name == "summary" {
            summary = field.text().await.ok();
        } else if name == "attachments" {
            let file_name = field.file_name().map(|s| s.to_string());
            let bytes = read_field_capped(&mut field, MAX_UPLOAD_BYTES)
                .await
                .map_err(|e| AppError::BadRequest(e.into()))?;
            let (mime, ext) = sniff_mime(&bytes).ok_or_else(|| {
                AppError::BadRequest(
                    "Unsupported file type. Attach a JPEG, PNG, WebP, or PDF file.".into(),
                )
            })?;
            if !["image/jpeg", "image/png", "image/webp", "application/pdf"].contains(&mime) {
                return Err(AppError::BadRequest(format!(
                    "Unsupported file type ({}).",
                    mime
                )));
            }
            let key = format!("tasks/{}{}", Uuid::new_v4(), ext);
            crate::storage::save_bytes(&key, &bytes)
                .await
                .map_err(|e| AppError::Internal(e.to_string()))?;
            let _ = file_name;
            keys.push(key);
        }
    }
    let summary = summary.unwrap_or_default().trim().to_string();
    if summary.is_empty() {
        return Err(AppError::BadRequest(
            "Completion summary is required.".into(),
        ));
    }
    let assign =
        sqlx::query("SELECT id FROM \"TaskAssignment\" WHERE \"taskId\"=$1 AND \"studentId\"=$2")
            .bind(&id)
            .bind(&auth.0.sub)
            .fetch_optional(&state.db)
            .await?
            .ok_or(AppError::NotFound)?;
    let aid: String = assign.try_get("id")?;
    let mut tx = state.db.begin().await?;
    let upd = sqlx::query(
        "UPDATE \"TaskAssignment\" SET status='SUBMITTED',\"updatedAt\"=NOW() WHERE id=$1 AND status IN ('IN_PROGRESS','RETURNED')",
    )
    .bind(&aid)
    .execute(&mut *tx)
    .await?;
    if upd.rows_affected() == 0 {
        return Err(AppError::Conflict(
            "Task is not ready for submission.".into(),
        ));
    }
    let v: i64 = sqlx::query(
        "SELECT COALESCE(MAX(version),0) as v FROM \"TaskSubmission\" WHERE \"assignmentId\"=$1",
    )
    .bind(&aid)
    .fetch_one(&mut *tx)
    .await?
    .try_get("v")
    .unwrap_or(0);
    let new_v = (v as i32) + 1;
    let sid = Uuid::new_v4().to_string();
    let keys_val = serde_json::json!(keys);
    sqlx::query("INSERT INTO \"TaskSubmission\" (id,\"assignmentId\",version,summary,\"attachmentKeys\",\"submittedAt\") VALUES ($1,$2,$3,$4,$5,NOW())")
        .bind(&sid).bind(&aid).bind(new_v).bind(summary).bind(&keys_val).execute(&mut *tx).await?;
    crate::audit::write_audit_log_tx(
        &mut tx,
        Some(&auth.0.sub),
        "TASK_SUBMITTED",
        "TaskAssignment",
        &aid,
        json!({"submissionId": sid, "version": new_v}),
    )
    .await
    .ok();
    tx.commit().await?;
    let submission = sqlx::query("SELECT id,\"assignmentId\",version,summary,\"attachmentKeys\",\"submittedAt\"::timestamptz FROM \"TaskSubmission\" WHERE id=$1").bind(&sid).fetch_one(&state.db).await?;
    Ok((StatusCode::CREATED, Json(json!({"submission": {
        "id": submission.try_get::<String,_>("id")?,
        "assignmentId": submission.try_get::<String,_>("assignmentId")?,
        "version": submission.try_get::<i32,_>("version")?,
        "summary": submission.try_get::<String,_>("summary")?,
        "attachmentKeys": submission.try_get::<serde_json::Value,_>("attachmentKeys")?,
        "submittedAt": submission.try_get::<chrono::DateTime<Utc>,_>("submittedAt")?.to_rfc3339(),
    }}))).into_response())
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
        #[serde(rename = "assignmentId")]
        assignment_id: Option<String>,
        status: String,
        #[serde(rename = "studentRemark", alias = "studentVisibleRemark")]
        student_visible_remark: Option<String>,
        #[serde(rename = "internalNote")]
        internal_note: Option<String>,
    }
    let b: B =
        serde_json::from_value(body).map_err(|_| AppError::BadRequest("Invalid review.".into()))?;
    if b.status != "ACCEPTED" && b.status != "RETURNED" {
        return Err(AppError::BadRequest("Invalid status.".into()));
    }
    if b.status == "RETURNED"
        && b.student_visible_remark
            .as_ref()
            .map(|s| s.trim().is_empty())
            .unwrap_or(true)
    {
        return Err(AppError::BadRequest("Return remarks are mandatory.".into()));
    }
    if b.student_visible_remark
        .as_deref()
        .is_some_and(|remark| remark.chars().count() > 4000)
        || b.internal_note
            .as_deref()
            .is_some_and(|note| note.chars().count() > 4000)
    {
        return Err(AppError::BadRequest("Invalid review.".into()));
    }
    // verify task ownership for admin
    let task = sqlx::query("SELECT \"createdById\" FROM \"Task\" WHERE id=$1")
        .bind(&id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
    let created_by: String = task.try_get("createdById")?;
    if auth.0.role == "ADMIN" && created_by != auth.0.sub {
        return Err(AppError::Forbidden);
    }
    let assignment_id = b
        .assignment_id
        .ok_or_else(|| AppError::BadRequest("Assignment ID is required.".into()))?;
    let assignment = sqlx::query("SELECT id,\"studentId\",status::text AS assignment_status FROM \"TaskAssignment\" WHERE id=$1 AND \"taskId\"=$2")
        .bind(&assignment_id)
        .bind(&id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
    let assignment_status: String = assignment.try_get("assignment_status")?;
    if assignment_status != "SUBMITTED" {
        return Err(AppError::Conflict(
            "Only submitted assignments can be reviewed.".into(),
        ));
    }
    let aid: String = assignment.try_get("id")?;
    let student_id: String = assignment.try_get("studentId")?;
    let new_status = if b.status == "ACCEPTED" {
        "ACCEPTED"
    } else {
        "RETURNED"
    };
    let mut tx = state.db.begin().await?;
    let updated_rows = sqlx::query("UPDATE \"TaskAssignment\" SET status=$1::\"TaskAssignmentStatus\",\"acceptedAt\"=CASE WHEN $1::text='ACCEPTED' THEN COALESCE(\"acceptedAt\", NOW()) ELSE \"acceptedAt\" END,\"updatedAt\"=NOW() WHERE id=$2 AND status='SUBMITTED'")
        .bind(new_status)
        .bind(&aid)
        .execute(&mut *tx)
        .await?;
    if updated_rows.rows_affected() == 0 {
        return Err(AppError::Conflict(
            "Only submitted assignments can be reviewed.".into(),
        ));
    }
    if let Some(r) = &b.student_visible_remark {
        if !r.trim().is_empty() {
            sqlx::query("INSERT INTO \"TaskRemark\" (id,\"assignmentId\",\"authorId\",visibility,body,\"createdAt\") VALUES ($1,$2,$3,'STUDENT_VISIBLE',$4,NOW())")
                .bind(Uuid::new_v4().to_string())
                .bind(&aid)
                .bind(&auth.0.sub)
                .bind(r.trim())
                .execute(&mut *tx)
                .await?;
        }
    }
    if let Some(n) = &b.internal_note {
        if !n.trim().is_empty() {
            sqlx::query("INSERT INTO \"TaskRemark\" (id,\"assignmentId\",\"authorId\",visibility,body,\"createdAt\") VALUES ($1,$2,$3,'INTERNAL_STAFF_ONLY',$4,NOW())")
                .bind(Uuid::new_v4().to_string())
                .bind(&aid)
                .bind(&auth.0.sub)
                .bind(n.trim())
                .execute(&mut *tx)
                .await?;
        }
    }
    crate::audit::write_audit_log_tx(
        &mut tx,
        Some(&auth.0.sub),
        "TASK_REVIEW",
        "TaskAssignment",
        &aid,
        json!({"status": new_status}),
    )
    .await
    .ok();
    let student_body = b
        .student_visible_remark
        .as_deref()
        .unwrap_or("Your task review was updated.");
    let notification_title = if new_status == "ACCEPTED" {
        "Task accepted"
    } else {
        "Task returned for revision"
    };
    sqlx::query("INSERT INTO \"Notification\" (id,\"userId\",type,title,body,link,\"isRead\",\"createdAt\") VALUES ($1,$2,'TASK_REVIEW',$3,$4,$5,false,NOW())")
        .bind(Uuid::new_v4().to_string()).bind(&student_id).bind(notification_title).bind(student_body).bind(format!("/tasks/{id}")).execute(&mut *tx).await?;
    tx.commit().await?;
    let updated = sqlx::query("SELECT id,\"taskId\",\"studentId\",status::text,\"startedAt\"::timestamptz,\"acceptedAt\"::timestamptz,\"createdAt\"::timestamptz,\"updatedAt\"::timestamptz FROM \"TaskAssignment\" WHERE id=$1").bind(&aid).fetch_one(&state.db).await?;
    Ok(Json(json!({"assignment": assignment_json(&updated)})))
}
