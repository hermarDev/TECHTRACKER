use crate::error::{AppError, Result};
use crate::middleware::AuthUser;
use crate::state::AppState;
use axum::extract::{Query, State};
use axum::routing::get;
use axum::{Json, Router};
use chrono::Utc;
use serde::Deserialize;
use serde_json::json;
use sqlx::Row;
use uuid::Uuid;

#[derive(Deserialize, Default)]
struct PageQ {
    page: Option<i64>,
    #[serde(rename = "pageSize")]
    page_size: Option<i64>,
}

fn require_sa(auth: &AuthUser) -> Result<()> {
    if auth.0.role != "SUPERADMIN" {
        return Err(AppError::Forbidden);
    }
    Ok(())
}
fn norm(page: Option<i64>, ps: Option<i64>) -> (i64, i64, i64) {
    let page = page.unwrap_or(1).max(1);
    let mut p = ps.unwrap_or(15);
    if ![15, 25, 50].contains(&p) {
        p = 15;
    }
    (page, p, (page - 1) * p)
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/superadmin/overview", get(overview))
        .route("/api/superadmin/audit", get(audit))
        .route(
            "/api/superadmin/rooms",
            get(rooms_list).post(rooms_create).patch(rooms_patch),
        )
        .route(
            "/api/superadmin/escalations",
            get(esc_list).patch(esc_patch),
        )
        .route(
            "/api/superadmin/config",
            get(config_get).patch(config_patch),
        )
        .route(
            "/api/superadmin/admins",
            get(admins_list).post(admins_create).patch(admins_patch),
        )
}

async fn overview(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<serde_json::Value>> {
    require_sa(&auth)?;
    let users: i64 = sqlx::query("SELECT COUNT(*) as c FROM \"User\"")
        .fetch_one(&state.db)
        .await?
        .try_get("c")
        .unwrap_or(0);
    let students: i64 =
        sqlx::query("SELECT COUNT(*) as c FROM \"User\" WHERE role::text='STUDENT'")
            .fetch_one(&state.db)
            .await?
            .try_get("c")
            .unwrap_or(0);
    let admins: i64 = sqlx::query("SELECT COUNT(*) as c FROM \"User\" WHERE role::text='ADMIN'")
        .fetch_one(&state.db)
        .await?
        .try_get("c")
        .unwrap_or(0);
    let batches: i64 = sqlx::query("SELECT COUNT(*) as c FROM \"Batch\"")
        .fetch_one(&state.db)
        .await?
        .try_get("c")
        .unwrap_or(0);
    let attendance: i64 = sqlx::query("SELECT COUNT(*) as c FROM \"AttendanceLog\"")
        .fetch_one(&state.db)
        .await?
        .try_get("c")
        .unwrap_or(0);
    let escalations: i64 =
        sqlx::query("SELECT COUNT(*) as c FROM \"EscalationCase\" WHERE status::text='OPEN'")
            .fetch_one(&state.db)
            .await?
            .try_get("c")
            .unwrap_or(0);
    Ok(Json(
        json!({"users": users, "students": students, "admins": admins, "batches": batches, "attendance": attendance, "openEscalations": escalations}),
    ))
}

async fn audit(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<PageQ>,
) -> Result<Json<serde_json::Value>> {
    if !["SUPERADMIN", "ADMIN"].contains(&auth.0.role.as_str()) {
        return Err(AppError::Forbidden);
    }
    let (page, ps, skip) = norm(q.page, q.page_size);
    let total: i64 = sqlx::query("SELECT COUNT(*) as c FROM \"AuditLog\"")
        .fetch_one(&state.db)
        .await?
        .try_get("c")
        .unwrap_or(0);
    let rows = sqlx::query("SELECT id,\"actorId\",action,\"entityType\",\"entityId\",details,\"createdAt\"::timestamptz FROM \"AuditLog\" ORDER BY \"createdAt\"::timestamptz DESC LIMIT $1 OFFSET $2")
        .bind(ps).bind(skip).fetch_all(&state.db).await?;
    let items: Vec<serde_json::Value> = rows.into_iter().map(|r| json!({
        "id": r.try_get::<String,_>("id").unwrap_or_default(),
        "actorId": r.try_get::<Option<String>,_>("actorId").unwrap_or(None),
        "action": r.try_get::<String,_>("action").unwrap_or_default(),
        "entityType": r.try_get::<String,_>("entityType").unwrap_or_default(),
        "entityId": r.try_get::<String,_>("entityId").unwrap_or_default(),
        "details": r.try_get::<serde_json::Value,_>("details").unwrap_or(json!({})),
        "createdAt": r.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
    })).collect();
    Ok(Json(
        json!({"items": items, "total": total, "page": page, "pageSize": ps}),
    ))
}

async fn rooms_list(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<serde_json::Value>> {
    require_sa(&auth)?;
    let rows = sqlx::query("SELECT id,name,building,capacity,\"isActive\",\"assignedAdminId\",\"assignedStudentId\",\"createdAt\"::timestamptz FROM \"LabRoom\" ORDER BY name ASC").fetch_all(&state.db).await?;
    let items: Vec<serde_json::Value> = rows.into_iter().map(|r| json!({
        "id": r.try_get::<String,_>("id").unwrap_or_default(),
        "name": r.try_get::<String,_>("name").unwrap_or_default(),
        "building": r.try_get::<String,_>("building").unwrap_or_default(),
        "capacity": r.try_get::<i32,_>("capacity").unwrap_or(40),
        "isActive": r.try_get::<bool,_>("isActive").unwrap_or(true),
        "assignedAdminId": r.try_get::<Option<String>,_>("assignedAdminId").unwrap_or(None),
        "assignedStudentId": r.try_get::<Option<String>,_>("assignedStudentId").unwrap_or(None),
        "createdAt": r.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
    })).collect();
    Ok(Json(json!({"rooms": items})))
}

#[derive(Deserialize)]
struct RoomCreateInput {
    name: String,
    building: String,
    capacity: Option<i32>,
}

async fn rooms_create(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>> {
    require_sa(&auth)?;
    let input: RoomCreateInput =
        serde_json::from_value(body).map_err(|_| AppError::BadRequest("Invalid room.".into()))?;
    if input.name.trim().is_empty() || input.building.trim().is_empty() {
        return Err(AppError::BadRequest("Invalid room.".into()));
    }
    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO \"LabRoom\" (id,name,building,capacity,\"isActive\",\"createdAt\") VALUES ($1,$2,$3,$4,true,NOW())")
        .bind(&id).bind(input.name.trim()).bind(input.building.trim()).bind(input.capacity.unwrap_or(40)).execute(&state.db).await?;
    Ok(Json(
        json!({"room": {"id": id, "name": input.name, "building": input.building, "capacity": input.capacity.unwrap_or(40)}}),
    ))
}

async fn rooms_patch(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>> {
    require_sa(&auth)?;
    #[derive(Deserialize)]
    struct B {
        id: String,
        name: Option<String>,
        building: Option<String>,
        capacity: Option<i32>,
        #[serde(rename = "isActive")]
        is_active: Option<bool>,
        #[serde(rename = "assignedAdminId")]
        assigned_admin: Option<String>,
        #[serde(rename = "assignedStudentId")]
        assigned_student: Option<String>,
    }
    let b: B =
        serde_json::from_value(body).map_err(|_| AppError::BadRequest("Invalid room.".into()))?;
    if b.id.trim().is_empty() {
        return Err(AppError::BadRequest("Invalid room.".into()));
    }
    if let Some(n) = &b.name {
        if n.trim().is_empty() || n.len() > 120 {
            return Err(AppError::BadRequest("Invalid room.".into()));
        }
    }
    if let Some(bl) = &b.building {
        if bl.trim().is_empty() || bl.len() > 120 {
            return Err(AppError::BadRequest("Invalid room.".into()));
        }
    }
    if let Some(c) = b.capacity {
        if !(1..=500).contains(&c) {
            return Err(AppError::BadRequest("Invalid room.".into()));
        }
    }
    if let Some(n) = &b.name {
        sqlx::query("UPDATE \"LabRoom\" SET name=$1 WHERE id=$2")
            .bind(n)
            .bind(&b.id)
            .execute(&state.db)
            .await?;
    }
    if let Some(bl) = &b.building {
        sqlx::query("UPDATE \"LabRoom\" SET building=$1 WHERE id=$2")
            .bind(bl)
            .bind(&b.id)
            .execute(&state.db)
            .await?;
    }
    if let Some(c) = b.capacity {
        sqlx::query("UPDATE \"LabRoom\" SET capacity=$1 WHERE id=$2")
            .bind(c)
            .bind(&b.id)
            .execute(&state.db)
            .await?;
    }
    if let Some(v) = b.is_active {
        sqlx::query("UPDATE \"LabRoom\" SET \"isActive\"=$1 WHERE id=$2")
            .bind(v)
            .bind(&b.id)
            .execute(&state.db)
            .await?;
    }
    if let Some(a) = &b.assigned_admin {
        sqlx::query("UPDATE \"LabRoom\" SET \"assignedAdminId\"=$1 WHERE id=$2")
            .bind(a)
            .bind(&b.id)
            .execute(&state.db)
            .await?;
    }
    if let Some(s) = &b.assigned_student {
        sqlx::query("UPDATE \"LabRoom\" SET \"assignedStudentId\"=$1 WHERE id=$2")
            .bind(s)
            .bind(&b.id)
            .execute(&state.db)
            .await?;
    }
    Ok(Json(json!({"message": "Room updated."})))
}

async fn esc_list(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<PageQ>,
) -> Result<Json<serde_json::Value>> {
    require_sa(&auth)?;
    let (page, ps, skip) = norm(q.page, q.page_size);
    let total: i64 = sqlx::query("SELECT COUNT(*) as c FROM \"EscalationCase\"")
        .fetch_one(&state.db)
        .await?
        .try_get("c")
        .unwrap_or(0);
    let rows = sqlx::query("SELECT id,\"sourceType\",\"sourceId\",\"raisedById\",\"studentId\",summary,\"policyDetails\",status::text,\"rulingNote\",\"ruledById\",\"ruledAt\"::timestamptz,\"createdAt\"::timestamptz FROM \"EscalationCase\" ORDER BY \"createdAt\"::timestamptz DESC LIMIT $1 OFFSET $2")
        .bind(ps).bind(skip).fetch_all(&state.db).await?;
    let items: Vec<serde_json::Value> = rows.into_iter().map(|r| json!({
        "id": r.try_get::<String,_>("id").unwrap_or_default(),
        "sourceType": r.try_get::<String,_>("sourceType").unwrap_or_default(),
        "sourceId": r.try_get::<String,_>("sourceId").unwrap_or_default(),
        "raisedById": r.try_get::<String,_>("raisedById").unwrap_or_default(),
        "studentId": r.try_get::<String,_>("studentId").unwrap_or_default(),
        "summary": r.try_get::<String,_>("summary").unwrap_or_default(),
        "policyDetails": r.try_get::<String,_>("policyDetails").unwrap_or_default(),
        "status": r.try_get::<String,_>("status").unwrap_or_default(),
        "rulingNote": r.try_get::<Option<String>,_>("rulingNote").unwrap_or(None),
        "ruledById": r.try_get::<Option<String>,_>("ruledById").unwrap_or(None),
        "ruledAt": r.try_get::<Option<chrono::DateTime<Utc>>,_>("ruledAt").ok().flatten().map(|d| d.to_rfc3339()),
        "createdAt": r.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
    })).collect();
    Ok(Json(
        json!({"items": items, "total": total, "page": page, "pageSize": ps}),
    ))
}

async fn esc_patch(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>> {
    require_sa(&auth)?;
    #[derive(Deserialize)]
    struct B {
        id: String,
        status: Option<String>,
        #[serde(rename = "rulingNote")]
        ruling_note: Option<String>,
    }
    let b: B = serde_json::from_value(body)
        .map_err(|_| AppError::BadRequest("Invalid escalation.".into()))?;
    if b.id.trim().is_empty() {
        return Err(AppError::BadRequest("Invalid escalation.".into()));
    }
    if let Some(s) = &b.status {
        if !["APPROVED", "UPHELD", "DISMISSED"].contains(&s.as_str()) {
            return Err(AppError::BadRequest("Invalid escalation.".into()));
        }
        if b.ruling_note
            .as_ref()
            .map(|r| r.trim().is_empty())
            .unwrap_or(true)
        {
            return Err(AppError::BadRequest("Invalid escalation.".into()));
        }
    }
    // existence + open check when ruling
    if b.status.is_some() {
        let row = sqlx::query("SELECT status::text FROM \"EscalationCase\" WHERE id=$1")
            .bind(&b.id)
            .fetch_optional(&state.db)
            .await?
            .ok_or(AppError::NotFound)?;
        let cur: String = row.try_get("status")?;
        if cur != "OPEN" {
            return Err(AppError::Conflict("Escalation already ruled.".into()));
        }
    }
    if let Some(s) = &b.status {
        let ruled_at = if s == "APPROVED" || s == "UPHELD" || s == "DISMISSED" {
            Some(Utc::now())
        } else {
            None
        };
        // Source record lookup (attendance escalation).
        let esc_row =
            sqlx::query("SELECT \"sourceType\", \"sourceId\" FROM \"EscalationCase\" WHERE id=$1")
                .bind(&b.id)
                .fetch_optional(&state.db)
                .await?
                .ok_or(AppError::NotFound)?;
        let source_type: String = esc_row.try_get("sourceType")?;
        let source_id: String = esc_row.try_get("sourceId")?;

        let mut tx = state.db.begin().await?;
        sqlx::query("UPDATE \"EscalationCase\" SET status=$1,\"rulingNote\"=$2,\"ruledById\"=$3,\"ruledAt\"=$4 WHERE id=$5")
            .bind(s)
            .bind(b.ruling_note.as_deref())
            .bind(&auth.0.sub)
            .bind(ruled_at)
            .bind(&b.id)
            .execute(&mut *tx)
            .await?;

        if source_type == "ATTENDANCE" {
            if s == "DISMISSED" {
                sqlx::query(
                    "UPDATE \"AttendanceLog\" SET status='REJECTED', \"creditedHours\"=0, \"updatedAt\"=NOW() WHERE id=$1",
                )
                .bind(&source_id)
                .execute(&mut *tx)
                .await?;
            } else {
                let rule_row = sqlx::query(
                    "SELECT \"creditRoundingRule\" FROM \"SystemConfig\" WHERE id='singleton'",
                )
                .fetch_optional(&mut *tx)
                .await
                .ok()
                .flatten();
                let rule = rule_row
                    .and_then(|r| r.try_get::<String, _>("creditRoundingRule").ok())
                    .filter(|v| !v.trim().is_empty())
                    .unwrap_or_else(|| "EXACT_MINUTES".to_string());
                let att = sqlx::query(
                    "SELECT \"timeIn\"::timestamptz, \"timeOut\"::timestamptz FROM \"AttendanceLog\" WHERE id=$1",
                )
                .bind(&source_id)
                .fetch_optional(&mut *tx)
                .await?;
                let credited = if let Some(r) = att {
                    let ti: chrono::DateTime<Utc> = r.try_get("timeIn")?;
                    let to: Option<chrono::DateTime<Utc>> = r.try_get("timeOut").ok();
                    match to {
                        Some(to) => {
                            let secs = (to - ti).num_seconds().max(0) as f64;
                            crate::routes::attendance::apply_credit_rounding(&rule, secs / 3600.0)
                        }
                        None => 0.0,
                    }
                } else {
                    0.0
                };
                sqlx::query(
                    "UPDATE \"AttendanceLog\" SET status='APPROVED', \"creditedHours\"=$1, \"updatedAt\"=NOW() WHERE id=$2",
                )
                .bind(credited)
                .bind(&source_id)
                .execute(&mut *tx)
                .await?;
            }
        } else if source_type == "TASK_REVIEW" {
            let task_status = if s == "DISMISSED" {
                "RETURNED"
            } else {
                "ACCEPTED"
            };
            sqlx::query(
                "UPDATE \"TaskAssignment\" SET status=$1, \"acceptedAt\"=CASE WHEN $1='ACCEPTED' THEN NOW() ELSE NULL END, \"updatedAt\"=NOW() WHERE id=$2",
            )
            .bind(task_status)
            .bind(&source_id)
            .execute(&mut *tx)
            .await?;
        }
        tx.commit().await?;
    }
    Ok(Json(json!({"message": "Escalation updated."})))
}

async fn config_get(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<serde_json::Value>> {
    require_sa(&auth)?;
    let row = sqlx::query("SELECT id,\"requiredPreOjtHours\",\"taskCategories\",\"creditRoundingRule\",\"allowSelfRegistration\",\"updatedAt\"::timestamptz FROM \"SystemConfig\" WHERE id='singleton'").fetch_one(&state.db).await?;
    Ok(Json(json!({"config": {
        "id": row.try_get::<String,_>("id").unwrap_or_default(),
        "requiredPreOjtHours": row.try_get::<f64,_>("requiredPreOjtHours").unwrap_or(100.0),
        "taskCategories": row.try_get::<serde_json::Value,_>("taskCategories").unwrap_or(json!([])),
        "creditRoundingRule": row.try_get::<String,_>("creditRoundingRule").unwrap_or_default(),
        "allowSelfRegistration": row.try_get::<bool,_>("allowSelfRegistration").unwrap_or(true),
        "updatedAt": row.try_get::<chrono::DateTime<Utc>,_>("updatedAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
    }})))
}

async fn config_patch(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>> {
    require_sa(&auth)?;
    let allowed_rules = [
        "EXACT_MINUTES",
        "ROUND_DOWN_15",
        "ROUND_UP_15",
        "NEAREST_QUARTER",
    ];

    // validate inputs
    if let Some(v) = body.get("requiredPreOjtHours") {
        let n = v
            .as_f64()
            .ok_or_else(|| AppError::BadRequest("Invalid config.".into()))?;
        if !(n > 0.0 && n <= 1000.0) {
            return Err(AppError::BadRequest("Invalid config.".into()));
        }
    }
    if let Some(v) = body.get("allowSelfRegistration") {
        if v.as_bool().is_none() {
            return Err(AppError::BadRequest("Invalid config.".into()));
        }
    }
    if let Some(v) = body.get("creditRoundingRule") {
        let s = v
            .as_str()
            .ok_or_else(|| AppError::BadRequest("Invalid config.".into()))?;
        if !allowed_rules.contains(&s) {
            return Err(AppError::BadRequest("Invalid config.".into()));
        }
    }
    if let Some(v) = body.get("taskCategories") {
        let arr = v
            .as_array()
            .ok_or_else(|| AppError::BadRequest("Invalid config.".into()))?;
        if arr.is_empty() || arr.len() > 20 {
            return Err(AppError::BadRequest("Invalid config.".into()));
        }
        for c in arr {
            let s = c
                .as_str()
                .ok_or_else(|| AppError::BadRequest("Invalid config.".into()))?;
            if s.trim().is_empty() || s.len() > 60 {
                return Err(AppError::BadRequest("Invalid config.".into()));
            }
        }
    }

    let mut any = false;
    if let Some(v) = body.get("requiredPreOjtHours").and_then(|x| x.as_f64()) {
        sqlx::query("UPDATE \"SystemConfig\" SET \"requiredPreOjtHours\"=$1,\"updatedAt\"=NOW() WHERE id='singleton'").bind(v).execute(&state.db).await?;
        any = true;
    }
    if let Some(v) = body.get("allowSelfRegistration").and_then(|x| x.as_bool()) {
        sqlx::query("UPDATE \"SystemConfig\" SET \"allowSelfRegistration\"=$1,\"updatedAt\"=NOW() WHERE id='singleton'").bind(v).execute(&state.db).await?;
        any = true;
    }
    if let Some(v) = body.get("creditRoundingRule").and_then(|x| x.as_str()) {
        sqlx::query("UPDATE \"SystemConfig\" SET \"creditRoundingRule\"=$1,\"updatedAt\"=NOW() WHERE id='singleton'").bind(v).execute(&state.db).await?;
        any = true;
    }
    if let Some(v) = body.get("taskCategories") {
        sqlx::query("UPDATE \"SystemConfig\" SET \"taskCategories\"=$1,\"updatedAt\"=NOW() WHERE id='singleton'").bind(v).execute(&state.db).await?;
        any = true;
    }
    if !any {
        return Err(AppError::BadRequest("Invalid config.".into()));
    }
    Ok(Json(json!({"message": "Config updated."})))
}

async fn admins_list(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<serde_json::Value>> {
    require_sa(&auth)?;
    let rows = sqlx::query("SELECT id,email,\"fullName\",role::text,status::text,\"createdAt\"::timestamptz FROM \"User\" WHERE role::text='ADMIN' ORDER BY \"fullName\" ASC").fetch_all(&state.db).await?;
    let items: Vec<serde_json::Value> = rows.into_iter().map(|r| json!({
        "id": r.try_get::<String,_>("id").unwrap_or_default(),
        "email": r.try_get::<String,_>("email").unwrap_or_default(),
        "fullName": r.try_get::<String,_>("fullName").unwrap_or_default(),
        "role": r.try_get::<String,_>("role").unwrap_or_default(),
        "status": r.try_get::<String,_>("status").unwrap_or_default(),
        "createdAt": r.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
    })).collect();
    Ok(Json(json!({"admins": items})))
}

async fn admins_create(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>> {
    require_sa(&auth)?;
    #[derive(Deserialize)]
    struct B {
        email: String,
        #[serde(rename = "fullName")]
        full_name: String,
        password: String,
    }
    let b: B =
        serde_json::from_value(body).map_err(|_| AppError::BadRequest("Invalid admin.".into()))?;
    if b.email.trim().is_empty() || b.full_name.trim().is_empty() || b.password.len() < 8 {
        return Err(AppError::BadRequest("Invalid admin.".into()));
    }
    let email = b.email.to_lowercase();
    let existing = sqlx::query("SELECT id FROM \"User\" WHERE email=$1")
        .bind(&email)
        .fetch_optional(&state.db)
        .await?;
    if existing.is_some() {
        return Err(AppError::Conflict("Email already exists.".into()));
    }
    let id = Uuid::new_v4().to_string();
    let hash = crate::auth::hash_password(&b.password)?;
    sqlx::query("INSERT INTO \"User\" (id,email,\"passwordHash\",\"fullName\",role,status,\"createdAt\",\"updatedAt\",\"requiredHours\",\"preOjtCompleted\",\"failedLoginCount\") VALUES ($1,$2,$3,$4,'ADMIN','ACTIVE',NOW(),NOW(),100,false,0)")
        .bind(&id).bind(&email).bind(&hash).bind(b.full_name.trim()).execute(&state.db).await?;
    Ok(Json(
        json!({"admin": {"id": id, "email": email, "fullName": b.full_name}}),
    ))
}

async fn admins_patch(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>> {
    require_sa(&auth)?;
    #[derive(Deserialize)]
    struct B {
        id: String,
        status: Option<String>,
        #[serde(rename = "fullName")]
        full_name: Option<String>,
    }
    let b: B =
        serde_json::from_value(body).map_err(|_| AppError::BadRequest("Invalid admin.".into()))?;
    if let Some(s) = &b.status {
        sqlx::query("UPDATE \"User\" SET status=$1,\"updatedAt\"=NOW() WHERE id=$2")
            .bind(s)
            .bind(&b.id)
            .execute(&state.db)
            .await?;
    }
    if let Some(n) = &b.full_name {
        sqlx::query("UPDATE \"User\" SET \"fullName\"=$1,\"updatedAt\"=NOW() WHERE id=$2")
            .bind(n)
            .bind(&b.id)
            .execute(&state.db)
            .await?;
    }
    Ok(Json(json!({"message": "Admin updated."})))
}
