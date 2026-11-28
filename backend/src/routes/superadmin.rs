use crate::error::{AppError, Result};
use crate::middleware::AuthUser;
use crate::state::AppState;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use chrono::Utc;
use serde::Deserialize;
use serde_json::json;
use sqlx::{QueryBuilder, Row};
use uuid::Uuid;

#[derive(Deserialize, Default)]
struct PageQ {
    page: Option<i64>,
    #[serde(rename = "pageSize")]
    page_size: Option<i64>,
    status: Option<String>,
    #[serde(rename = "sourceType")]
    source_type: Option<String>,
}

#[derive(Deserialize, Default)]
struct AdminsQ {
    page: Option<i64>,
    #[serde(rename = "pageSize")]
    page_size: Option<i64>,
    search: Option<String>,
    status: Option<String>,
}

#[derive(Deserialize, Default)]
struct AuditQ {
    page: Option<i64>,
    #[serde(rename = "pageSize")]
    page_size: Option<i64>,
    search: Option<String>,
    #[serde(rename = "entityType")]
    entity_type: Option<String>,
    action: Option<String>,
}

fn require_sa(auth: &AuthUser) -> Result<()> {
    if auth.0.role != "SUPERADMIN" {
        return Err(AppError::Forbidden);
    }
    Ok(())
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
    let users = sqlx::query("SELECT role::text AS role, COUNT(id)::bigint AS count FROM \"User\" GROUP BY role ORDER BY role")
        .fetch_all(&state.db).await?;
    let users_by_role: Vec<serde_json::Value> = users.into_iter().map(|r| json!({"role": r.try_get::<String,_>("role").unwrap_or_default(), "_count": {"id": r.try_get::<i64,_>("count").unwrap_or(0)}})).collect();
    let escalations = sqlx::query("SELECT status::text AS status, COUNT(id)::bigint AS count FROM \"EscalationCase\" GROUP BY status ORDER BY status")
        .fetch_all(&state.db).await?;
    let escalations_by_status: Vec<serde_json::Value> = escalations.into_iter().map(|r| json!({"status": r.try_get::<String,_>("status").unwrap_or_default(), "_count": {"id": r.try_get::<i64,_>("count").unwrap_or(0)}})).collect();
    let batch_count: i64 = sqlx::query_scalar("SELECT COUNT(*)::bigint FROM \"Batch\"")
        .fetch_one(&state.db)
        .await?;
    let inspection_count: i64 = sqlx::query_scalar("SELECT COUNT(*)::bigint FROM \"Inspection\"")
        .fetch_one(&state.db)
        .await?;
    let unread_notifications: i64 =
        sqlx::query_scalar("SELECT COUNT(*)::bigint FROM \"Notification\" WHERE \"isRead\"=false")
            .fetch_one(&state.db)
            .await?;
    Ok(Json(
        json!({"usersByRole": users_by_role, "batchCount": batch_count, "escalationsByStatus": escalations_by_status, "inspectionCount": inspection_count, "unreadNotifications": unread_notifications}),
    ))
}

async fn audit(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<AuditQ>,
) -> Result<Json<serde_json::Value>> {
    require_sa(&auth)?;
    let (page, ps, skip) = super::normalize_pagination(q.page, q.page_size);
    let mut count_query = QueryBuilder::new("SELECT COUNT(*) AS c FROM \"AuditLog\" a LEFT JOIN \"User\" u ON u.id=a.\"actorId\" WHERE TRUE");
    let mut data_query = QueryBuilder::new("SELECT a.id,a.\"actorId\",a.action,a.\"entityType\",a.\"entityId\",a.details,a.\"createdAt\"::timestamptz,u.\"fullName\" AS \"actorFullName\",u.email AS \"actorEmail\",u.role::text AS \"actorRole\" FROM \"AuditLog\" a LEFT JOIN \"User\" u ON u.id=a.\"actorId\" WHERE TRUE");
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
                .push(" AND (a.action ILIKE ")
                .push_bind(pattern.clone())
                .push(" ESCAPE '!' OR a.\"entityType\" ILIKE ")
                .push_bind(pattern.clone())
                .push(" ESCAPE '!' OR a.\"entityId\" ILIKE ")
                .push_bind(pattern.clone())
                .push(" ESCAPE '!' OR u.\"fullName\" ILIKE ")
                .push_bind(pattern.clone())
                .push(" ESCAPE '!' OR u.email ILIKE ")
                .push_bind(pattern.clone())
                .push(" ESCAPE '!')");
        }
    }
    if let Some(entity_type) = q.entity_type.as_deref().filter(|s| !s.is_empty()) {
        count_query
            .push(" AND a.\"entityType\"=")
            .push_bind(entity_type);
        data_query
            .push(" AND a.\"entityType\"=")
            .push_bind(entity_type);
    }
    if let Some(action) = q.action.as_deref().filter(|s| !s.is_empty()) {
        count_query.push(" AND a.action=").push_bind(action);
        data_query.push(" AND a.action=").push_bind(action);
    }
    let total: i64 = count_query
        .build()
        .fetch_one(&state.db)
        .await?
        .try_get("c")
        .unwrap_or(0);
    let rows = data_query
        .push(" ORDER BY a.\"createdAt\" DESC LIMIT ")
        .push_bind(ps)
        .push(" OFFSET ")
        .push_bind(skip)
        .build()
        .fetch_all(&state.db)
        .await?;
    let items: Vec<serde_json::Value> = rows.into_iter().map(|r| {
        let actor_id: Option<String> = r.try_get("actorId").unwrap_or(None);
        let actor = actor_id.as_ref().map(|id| json!({"id": id, "fullName": r.try_get::<Option<String>,_>("actorFullName").unwrap_or(None), "email": r.try_get::<Option<String>,_>("actorEmail").unwrap_or(None), "role": r.try_get::<Option<String>,_>("actorRole").unwrap_or(None)}));
        json!({"id": r.try_get::<String,_>("id").unwrap_or_default(), "actorId": actor_id, "actor": actor, "action": r.try_get::<String,_>("action").unwrap_or_default(), "entityType": r.try_get::<String,_>("entityType").unwrap_or_default(), "entityId": r.try_get::<String,_>("entityId").unwrap_or_default(), "details": r.try_get::<serde_json::Value,_>("details").unwrap_or(json!({})), "createdAt": r.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default()})
    }).collect();
    let types =
        sqlx::query("SELECT DISTINCT \"entityType\" FROM \"AuditLog\" ORDER BY \"entityType\" ASC")
            .fetch_all(&state.db)
            .await?;
    let entity_types: Vec<String> = types
        .into_iter()
        .filter_map(|r| r.try_get("entityType").ok())
        .collect();
    Ok(Json(
        json!({"data": items, "page": page, "pageSize": ps, "total": total, "totalPages": (total as f64 / ps as f64).ceil() as i64, "entityTypes": entity_types}),
    ))
}

async fn rooms_list(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<serde_json::Value>> {
    require_sa(&auth)?;
    let rows = sqlx::query("SELECT id,name,building,capacity,\"isActive\",\"assignedAdminId\",\"assignedStudentId\",\"createdAt\"::timestamptz FROM \"LabRoom\" ORDER BY name ASC").fetch_all(&state.db).await?;
    let room_ids: Vec<String> = rows
        .iter()
        .filter_map(|r| r.try_get::<String, _>("id").ok())
        .collect();
    let mut units_by_room: std::collections::HashMap<String, Vec<serde_json::Value>> =
        std::collections::HashMap::new();
    if !room_ids.is_empty() {
        for u in sqlx::query("SELECT id,\"roomId\",\"unitCode\",specs,condition::text,\"lastInspectedAt\"::timestamptz FROM \"ComputerUnit\" WHERE \"roomId\" = ANY($1) ORDER BY \"unitCode\" ASC")
            .bind(&room_ids)
            .fetch_all(&state.db)
            .await?
        {
            let room_id: String = u.try_get("roomId").unwrap_or_default();
            units_by_room.entry(room_id).or_default().push(unit_json(&u));
        }
    }
    let mut rooms = Vec::with_capacity(rows.len());
    for row in rows {
        let room_id: String = row.try_get("id")?;
        let units = units_by_room.remove(&room_id).unwrap_or_default();
        rooms.push(room_json(&row, units));
    }
    Ok(Json(json!({"rooms": rooms})))
}

async fn rooms_create(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<serde_json::Value>,
) -> Result<axum::response::Response> {
    require_sa(&auth)?;
    let name = body
        .get("name")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .trim();
    let building = body
        .get("building")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .trim();
    let capacity = body
        .get("capacity")
        .and_then(serde_json::Value::as_i64)
        .unwrap_or(40);
    if name.chars().count() < 2
        || name.chars().count() > 120
        || building.is_empty()
        || building.chars().count() > 120
        || !(1..=500).contains(&capacity)
    {
        return Err(AppError::BadRequest("Invalid room.".into()));
    }
    let admin_id = body
        .get("assignedAdminId")
        .and_then(serde_json::Value::as_str);
    let student_id = body
        .get("assignedStudentId")
        .and_then(serde_json::Value::as_str);
    validate_room_assignees(&state, admin_id, student_id).await?;
    let units = body
        .get("units")
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default();
    if body.get("units").is_some_and(|value| !value.is_array()) {
        return Err(AppError::BadRequest("Invalid units".into()));
    }
    validate_units(&units)?;
    let existing = sqlx::query("SELECT id FROM \"LabRoom\" WHERE name=$1")
        .bind(name)
        .fetch_optional(&state.db)
        .await?;
    if existing.is_some() {
        return Err(AppError::Conflict(
            "A lab room with this name already exists".into(),
        ));
    }
    let id = Uuid::new_v4().to_string();
    let mut tx = state.db.begin().await?;
    sqlx::query("INSERT INTO \"LabRoom\" (id,name,building,capacity,\"isActive\",\"assignedAdminId\",\"assignedStudentId\",\"createdAt\") VALUES ($1,$2,$3,$4,true,$5,$6,NOW())")
        .bind(&id).bind(name).bind(building).bind(capacity as i32).bind(admin_id).bind(student_id).execute(&mut *tx).await?;
    for unit in &units {
        insert_unit(&mut tx, &id, unit).await?;
    }
    tx.commit().await?;
    crate::audit::write_audit_log(
        &state,
        Some(&auth.0.sub),
        "LABROOM_CREATED",
        "LabRoom",
        &id,
        json!({"name": name, "building": building, "unitCount": units.len()}),
    )
    .await?;
    let room = load_room(&state, &id).await?;
    Ok((StatusCode::CREATED, Json(json!({"room": room}))).into_response())
}

async fn rooms_patch(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>> {
    require_sa(&auth)?;
    let room_id = body
        .get("roomId")
        .or_else(|| body.get("id"))
        .and_then(serde_json::Value::as_str);
    let unit_id = body.get("unitId").and_then(serde_json::Value::as_str);
    let new_units = body.get("newUnits").and_then(serde_json::Value::as_array);
    if body.get("newUnits").is_some_and(|value| !value.is_array()) {
        return Err(AppError::BadRequest("Invalid units".into()));
    }
    if room_id.is_none() && unit_id.is_none() && new_units.is_none() {
        return Err(AppError::BadRequest(
            "Provide roomId, unitId, or newUnits to add units".into(),
        ));
    }
    if let Some(unit_id) = unit_id {
        if room_id.is_some() || new_units.is_some() {
            return Err(AppError::BadRequest(
                "Provide either unitId or roomId, not both".into(),
            ));
        }
        let unit =
            sqlx::query("SELECT id,\"roomId\",\"unitCode\" FROM \"ComputerUnit\" WHERE id=$1")
                .bind(unit_id)
                .fetch_optional(&state.db)
                .await?
                .ok_or(AppError::NotFound)?;
        let room_ref: String = unit.try_get("roomId")?;
        let mut tx = state.db.begin().await?;
        if let Some(code) = body.get("unitCode").and_then(serde_json::Value::as_str) {
            let code = code.trim();
            if code.is_empty() || code.chars().count() > 40 {
                return Err(AppError::BadRequest("Invalid unit code".into()));
            }
            let taken = sqlx::query("SELECT id FROM \"ComputerUnit\" WHERE \"roomId\"=$1 AND \"unitCode\"=$2 AND id<>$3").bind(&room_ref).bind(code).bind(unit_id).fetch_optional(&mut *tx).await?;
            if taken.is_some() {
                return Err(AppError::Conflict(
                    "Another unit in this room already uses that unit code".into(),
                ));
            }
            sqlx::query("UPDATE \"ComputerUnit\" SET \"unitCode\"=$1 WHERE id=$2")
                .bind(code)
                .bind(unit_id)
                .execute(&mut *tx)
                .await?;
        }
        if let Some(specs) = body.get("specs").and_then(serde_json::Value::as_str) {
            if specs.chars().count() > 200 {
                return Err(AppError::BadRequest("Invalid specs".into()));
            }
            sqlx::query("UPDATE \"ComputerUnit\" SET specs=$1 WHERE id=$2")
                .bind(specs.trim())
                .bind(unit_id)
                .execute(&mut *tx)
                .await?;
        }
        if let Some(condition) = body.get("condition").and_then(serde_json::Value::as_str) {
            if !["FUNCTIONING", "NEEDS_MAINTENANCE", "NEEDS_REPAIR"].contains(&condition) {
                return Err(AppError::BadRequest("Invalid condition".into()));
            }
            sqlx::query("UPDATE \"ComputerUnit\" SET condition=$1::\"UnitCondition\" WHERE id=$2")
                .bind(condition)
                .bind(unit_id)
                .execute(&mut *tx)
                .await?;
        }
        tx.commit().await?;
        crate::audit::write_audit_log(
            &state,
            Some(&auth.0.sub),
            "UNIT_UPDATED",
            "ComputerUnit",
            unit_id,
            json!({"roomId": room_ref, "changes": body}),
        )
        .await?;
        let updated = sqlx::query("SELECT id,\"roomId\",\"unitCode\",specs,condition::text,\"lastInspectedAt\"::timestamptz FROM \"ComputerUnit\" WHERE id=$1").bind(unit_id).fetch_one(&state.db).await?;
        return Ok(Json(json!({"unit": unit_json(&updated)})));
    }
    let room_id = room_id
        .ok_or_else(|| AppError::BadRequest("roomId is required for room-level changes".into()))?;
    let current = sqlx::query("SELECT id,name,building FROM \"LabRoom\" WHERE id=$1")
        .bind(room_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;
    if let Some(value) = body.get("assignedAdminId") {
        validate_room_assignees(&state, value.as_str(), None).await?;
    }
    if let Some(value) = body.get("assignedStudentId") {
        validate_room_assignees(&state, None, value.as_str()).await?;
    }
    if let Some(units) = new_units {
        validate_units(units)?;
    }
    let mut tx = state.db.begin().await?;
    if let Some(name) = body.get("name").and_then(serde_json::Value::as_str) {
        let name = name.trim();
        if name.chars().count() < 2 || name.chars().count() > 120 {
            return Err(AppError::BadRequest("Invalid room name".into()));
        }
        let taken = sqlx::query("SELECT id FROM \"LabRoom\" WHERE name=$1 AND id<>$2")
            .bind(name)
            .bind(room_id)
            .fetch_optional(&mut *tx)
            .await?;
        if taken.is_some() {
            return Err(AppError::Conflict(
                "A lab room with this name already exists".into(),
            ));
        }
        sqlx::query("UPDATE \"LabRoom\" SET name=$1 WHERE id=$2")
            .bind(name)
            .bind(room_id)
            .execute(&mut *tx)
            .await?;
    }
    if let Some(building) = body.get("building").and_then(serde_json::Value::as_str) {
        let building = building.trim();
        if building.is_empty() || building.chars().count() > 120 {
            return Err(AppError::BadRequest("Invalid building".into()));
        }
        sqlx::query("UPDATE \"LabRoom\" SET building=$1 WHERE id=$2")
            .bind(building)
            .bind(room_id)
            .execute(&mut *tx)
            .await?;
    }
    if let Some(capacity) = body.get("capacity").and_then(serde_json::Value::as_i64) {
        if !(1..=500).contains(&capacity) {
            return Err(AppError::BadRequest("Invalid capacity".into()));
        }
        sqlx::query("UPDATE \"LabRoom\" SET capacity=$1 WHERE id=$2")
            .bind(capacity as i32)
            .bind(room_id)
            .execute(&mut *tx)
            .await?;
    }
    if let Some(active) = body.get("isActive").and_then(serde_json::Value::as_bool) {
        sqlx::query("UPDATE \"LabRoom\" SET \"isActive\"=$1 WHERE id=$2")
            .bind(active)
            .bind(room_id)
            .execute(&mut *tx)
            .await?;
    }
    if let Some(value) = body.get("assignedAdminId") {
        let id = value.as_str();
        sqlx::query("UPDATE \"LabRoom\" SET \"assignedAdminId\"=$1 WHERE id=$2")
            .bind(id)
            .bind(room_id)
            .execute(&mut *tx)
            .await?;
    }
    if let Some(value) = body.get("assignedStudentId") {
        let id = value.as_str();
        sqlx::query("UPDATE \"LabRoom\" SET \"assignedStudentId\"=$1 WHERE id=$2")
            .bind(id)
            .bind(room_id)
            .execute(&mut *tx)
            .await?;
    }
    if let Some(units) = new_units {
        for unit in units {
            let code = unit
                .get("unitCode")
                .and_then(serde_json::Value::as_str)
                .unwrap_or_default()
                .trim();
            let taken = sqlx::query(
                "SELECT id FROM \"ComputerUnit\" WHERE \"roomId\"=$1 AND \"unitCode\"=$2",
            )
            .bind(room_id)
            .bind(code)
            .fetch_optional(&mut *tx)
            .await?;
            if taken.is_some() {
                return Err(AppError::Conflict(format!(
                    "Unit code {code} already exists in this room"
                )));
            }
            insert_unit(&mut tx, room_id, unit).await?;
        }
    }
    tx.commit().await?;
    let action = if new_units.is_some_and(|units| !units.is_empty()) {
        "UNITS_ADDED"
    } else {
        "LABROOM_UPDATED"
    };
    crate::audit::write_audit_log(
        &state,
        Some(&auth.0.sub),
        action,
        "LabRoom",
        room_id,
        json!({"room": current.try_get::<String,_>("name").unwrap_or_default(), "changes": body}),
    )
    .await?;
    Ok(Json(json!({"room": load_room(&state, room_id).await?})))
}

fn unit_json(row: &sqlx::postgres::PgRow) -> serde_json::Value {
    json!({"id": row.try_get::<String,_>("id").unwrap_or_default(), "roomId": row.try_get::<String,_>("roomId").unwrap_or_default(), "unitCode": row.try_get::<String,_>("unitCode").unwrap_or_default(), "specs": row.try_get::<String,_>("specs").unwrap_or_default(), "condition": row.try_get::<String,_>("condition").unwrap_or_default(), "lastInspectedAt": row.try_get::<Option<chrono::DateTime<Utc>>,_>("lastInspectedAt").ok().flatten().map(|d| d.to_rfc3339())})
}

fn room_json(row: &sqlx::postgres::PgRow, units: Vec<serde_json::Value>) -> serde_json::Value {
    json!({"id": row.try_get::<String,_>("id").unwrap_or_default(), "name": row.try_get::<String,_>("name").unwrap_or_default(), "building": row.try_get::<String,_>("building").unwrap_or_default(), "capacity": row.try_get::<i32,_>("capacity").unwrap_or(40), "isActive": row.try_get::<bool,_>("isActive").unwrap_or(true), "assignedAdminId": row.try_get::<Option<String>,_>("assignedAdminId").unwrap_or(None), "assignedStudentId": row.try_get::<Option<String>,_>("assignedStudentId").unwrap_or(None), "createdAt": row.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(), "units": units})
}

async fn load_room(state: &AppState, room_id: &str) -> Result<serde_json::Value> {
    let row = sqlx::query("SELECT id,name,building,capacity,\"isActive\",\"assignedAdminId\",\"assignedStudentId\",\"createdAt\"::timestamptz FROM \"LabRoom\" WHERE id=$1").bind(room_id).fetch_optional(&state.db).await?.ok_or(AppError::NotFound)?;
    let units = sqlx::query("SELECT id,\"roomId\",\"unitCode\",specs,condition::text,\"lastInspectedAt\"::timestamptz FROM \"ComputerUnit\" WHERE \"roomId\"=$1 ORDER BY \"unitCode\" ASC").bind(room_id).fetch_all(&state.db).await?;
    Ok(room_json(&row, units.iter().map(unit_json).collect()))
}

async fn validate_room_assignees(
    state: &AppState,
    admin_id: Option<&str>,
    student_id: Option<&str>,
) -> Result<()> {
    if let Some(id) = admin_id {
        let role: Option<String> =
            sqlx::query_scalar("SELECT role::text FROM \"User\" WHERE id=$1")
                .bind(id)
                .fetch_optional(&state.db)
                .await?;
        if !matches!(role.as_deref(), Some("ADMIN" | "SUPERADMIN")) {
            return Err(AppError::NotFound);
        }
    }
    if let Some(id) = student_id {
        let role: Option<String> =
            sqlx::query_scalar("SELECT role::text FROM \"User\" WHERE id=$1")
                .bind(id)
                .fetch_optional(&state.db)
                .await?;
        if role.as_deref() != Some("STUDENT") {
            return Err(AppError::NotFound);
        }
    }
    Ok(())
}

fn validate_units(units: &[serde_json::Value]) -> Result<()> {
    let mut codes = std::collections::HashSet::new();
    for unit in units {
        let code = unit
            .get("unitCode")
            .and_then(serde_json::Value::as_str)
            .unwrap_or_default()
            .trim();
        if code.is_empty() || code.chars().count() > 40 || !codes.insert(code.to_string()) {
            return Err(AppError::BadRequest(
                "Invalid or duplicate unit code".into(),
            ));
        }
        if unit
            .get("specs")
            .and_then(serde_json::Value::as_str)
            .is_some_and(|specs| specs.chars().count() > 200)
        {
            return Err(AppError::BadRequest("Invalid unit specs".into()));
        }
    }
    Ok(())
}

async fn insert_unit(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    room_id: &str,
    unit: &serde_json::Value,
) -> Result<()> {
    let code = unit
        .get("unitCode")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .trim();
    let specs = unit
        .get("specs")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("Desktop Workstation");
    sqlx::query("INSERT INTO \"ComputerUnit\" (id,\"roomId\",\"unitCode\",specs,condition) VALUES ($1,$2,$3,$4,'FUNCTIONING')")
        .bind(Uuid::new_v4().to_string()).bind(room_id).bind(code).bind(specs).execute(&mut **tx).await?;
    Ok(())
}

async fn esc_list(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<PageQ>,
) -> Result<Json<serde_json::Value>> {
    require_sa(&auth)?;
    let (page, ps, skip) = super::normalize_pagination(q.page, q.page_size);
    let mut count_query =
        QueryBuilder::new("SELECT COUNT(*) AS c FROM \"EscalationCase\" WHERE TRUE");
    let mut data_query = QueryBuilder::new("SELECT e.id,e.\"sourceType\"::text,e.\"sourceId\",e.\"raisedById\",e.\"studentId\",e.summary,e.\"policyDetails\",e.status::text,e.\"rulingNote\",e.\"ruledById\",e.\"ruledAt\"::timestamptz,e.\"createdAt\"::timestamptz,s.\"fullName\" AS \"studentName\",s.email AS \"studentEmail\",s.\"studentIdNo\",rb.\"fullName\" AS \"raisedName\",rb.role::text AS \"raisedRole\",ub.\"fullName\" AS \"ruledName\",ub.role::text AS \"ruledRole\" FROM \"EscalationCase\" e JOIN \"User\" s ON s.id=e.\"studentId\" JOIN \"User\" rb ON rb.id=e.\"raisedById\" LEFT JOIN \"User\" ub ON ub.id=e.\"ruledById\" WHERE TRUE");
    if let Some(status) = q
        .status
        .as_deref()
        .filter(|s| ["OPEN", "APPROVED", "UPHELD", "DISMISSED"].contains(s))
    {
        count_query.push(" AND status::text=").push_bind(status);
        data_query.push(" AND e.status::text=").push_bind(status);
    }
    if let Some(source_type) = q
        .source_type
        .as_deref()
        .filter(|s| ["ATTENDANCE", "TASK_REVIEW"].contains(s))
    {
        count_query
            .push(" AND \"sourceType\"::text=")
            .push_bind(source_type);
        data_query
            .push(" AND e.\"sourceType\"::text=")
            .push_bind(source_type);
    }
    let total: i64 = count_query
        .build()
        .fetch_one(&state.db)
        .await?
        .try_get("c")
        .unwrap_or(0);
    let rows = data_query
        .push(" ORDER BY e.\"createdAt\" DESC LIMIT ")
        .push_bind(ps)
        .push(" OFFSET ")
        .push_bind(skip)
        .build()
        .fetch_all(&state.db)
        .await?;
    let items: Vec<serde_json::Value> = rows.into_iter().map(|r| escalation_json(&r)).collect();
    Ok(Json(
        json!({"data": items, "total": total, "page": page, "pageSize": ps, "totalPages": (total as f64 / ps as f64).ceil() as i64}),
    ))
}

async fn esc_patch(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>> {
    require_sa(&auth)?;
    let escalation_id = body
        .get("escalationId")
        .or_else(|| body.get("id"))
        .and_then(serde_json::Value::as_str)
        .filter(|id| !id.is_empty())
        .ok_or_else(|| AppError::BadRequest("Invalid escalation.".into()))?;
    let status = body
        .get("status")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| AppError::BadRequest("Invalid escalation.".into()))?;
    let ruling_note = body
        .get("rulingNote")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|note| !note.is_empty() && note.chars().count() <= 2000)
        .ok_or_else(|| AppError::BadRequest("A written ruling note is required".into()))?;
    if !["APPROVED", "UPHELD", "DISMISSED"].contains(&status) {
        return Err(AppError::BadRequest("Invalid escalation status".into()));
    }
    let rule = crate::routes::attendance::credit_rounding_rule(&state).await;
    let mut tx = state.db.begin().await?;
    let escalation = sqlx::query("SELECT id,\"sourceType\"::text,\"sourceId\",\"raisedById\",\"studentId\",status::text FROM \"EscalationCase\" WHERE id=$1 FOR UPDATE").bind(escalation_id).fetch_optional(&mut *tx).await?.ok_or(AppError::NotFound)?;
    let previous_status: String = escalation.try_get("status")?;
    if previous_status != "OPEN" {
        return Err(AppError::Conflict(format!(
            "This escalation case was already ruled ({previous_status})"
        )));
    }
    let source_type: String = escalation.try_get("sourceType")?;
    let source_id: String = escalation.try_get("sourceId")?;
    let student_id: String = escalation.try_get("studentId")?;
    let raised_by_id: String = escalation.try_get("raisedById")?;
    let ruled_at = Utc::now();
    let in_students_favour = status == "APPROVED" || status == "UPHELD";
    if source_type == "ATTENDANCE" {
        let attendance = sqlx::query("SELECT \"recordedHours\" FROM \"AttendanceLog\" WHERE id=$1")
            .bind(&source_id)
            .fetch_optional(&mut *tx)
            .await?;
        if let Some(attendance) = attendance {
            let credited: f64 = if in_students_favour {
                let recorded_hours: f64 = attendance.try_get("recordedHours").unwrap_or(0.0);
                crate::routes::attendance::apply_credit_rounding(&rule, recorded_hours)
            } else {
                0.0
            };
            sqlx::query("UPDATE \"AttendanceLog\" SET status=$1::\"AttendanceStatus\",\"creditedHours\"=$2,\"reviewerId\"=$3,\"reviewedAt\"=$4,\"reviewerRemarks\"=$5,\"updatedAt\"=NOW() WHERE id=$6")
                .bind(if in_students_favour { "APPROVED" } else { "REJECTED" }).bind(credited).bind(&auth.0.sub).bind(ruled_at).bind(ruling_note).bind(&source_id).execute(&mut *tx).await?;
        }
    } else {
        let assignment = sqlx::query("SELECT id FROM \"TaskAssignment\" WHERE id=$1")
            .bind(&source_id)
            .fetch_optional(&mut *tx)
            .await?;
        if assignment.is_some() {
            if in_students_favour {
                sqlx::query("UPDATE \"TaskAssignment\" SET status='ACCEPTED'::\"TaskAssignmentStatus\",\"acceptedAt\"=COALESCE(\"acceptedAt\", NOW()),\"updatedAt\"=NOW() WHERE id=$1")
                    .bind(&source_id)
                    .execute(&mut *tx)
                    .await?;
            } else {
                sqlx::query("UPDATE \"TaskAssignment\" SET status='RETURNED'::\"TaskAssignmentStatus\",\"updatedAt\"=NOW() WHERE id=$1")
                    .bind(&source_id)
                    .execute(&mut *tx)
                    .await?;
            }
        }
    }
    let esc_updated = sqlx::query("UPDATE \"EscalationCase\" SET status=$1::\"EscalationStatus\",\"rulingNote\"=$2,\"ruledById\"=$3,\"ruledAt\"=$4 WHERE id=$5 AND status='OPEN'")
        .bind(status).bind(ruling_note).bind(&auth.0.sub).bind(ruled_at).bind(escalation_id).execute(&mut *tx).await?;
    if esc_updated.rows_affected() == 0 {
        return Err(AppError::Conflict(format!(
            "This escalation case was already ruled ({previous_status})"
        )));
    }
    let student_name: String = sqlx::query_scalar("SELECT \"fullName\" FROM \"User\" WHERE id=$1")
        .bind(&student_id)
        .fetch_one(&mut *tx)
        .await?;
    let student_number: Option<String> =
        sqlx::query_scalar("SELECT \"studentIdNo\" FROM \"User\" WHERE id=$1")
            .bind(&student_id)
            .fetch_one(&mut *tx)
            .await?;
    let subject = format!("Escalation ruling: {status}");
    let student_body = format!(
        "Your escalated {} case was {}. Ruling: {}",
        if source_type == "ATTENDANCE" {
            "attendance"
        } else {
            "task"
        },
        status.to_lowercase(),
        ruling_note
    );
    sqlx::query("INSERT INTO \"Notification\" (id,\"userId\",type,title,body,link,\"isRead\",\"createdAt\") VALUES ($1,$2,'ESCALATION',$3,$4,'/notifications',false,NOW())")
        .bind(Uuid::new_v4().to_string()).bind(&student_id).bind(&subject).bind(student_body).execute(&mut *tx).await?;
    if raised_by_id != student_id {
        let raised_body = format!(
            "Escalation for {} ({}) was ruled {}.",
            student_name,
            student_number.as_deref().unwrap_or("student"),
            status.to_lowercase()
        );
        sqlx::query("INSERT INTO \"Notification\" (id,\"userId\",type,title,body,link,\"isRead\",\"createdAt\") VALUES ($1,$2,'ESCALATION',$3,$4,'/notifications',false,NOW())")
            .bind(Uuid::new_v4().to_string()).bind(&raised_by_id).bind(&subject).bind(raised_body).execute(&mut *tx).await?;
    }
    tx.commit().await?;
    crate::audit::write_audit_log(&state, Some(&auth.0.sub), "ESCALATION_RULED", "EscalationCase", escalation_id, json!({"status": status, "rulingNote": ruling_note, "sourceType": source_type, "sourceId": source_id, "studentId": student_id})).await?;
    let updated = sqlx::query("SELECT e.id,e.\"sourceType\"::text,e.\"sourceId\",e.\"raisedById\",e.\"studentId\",e.summary,e.\"policyDetails\",e.status::text,e.\"rulingNote\",e.\"ruledById\",e.\"ruledAt\"::timestamptz,e.\"createdAt\"::timestamptz,s.\"fullName\" AS \"studentName\",s.email AS \"studentEmail\",s.\"studentIdNo\",rb.\"fullName\" AS \"raisedName\",rb.role::text AS \"raisedRole\",ub.\"fullName\" AS \"ruledName\",ub.role::text AS \"ruledRole\" FROM \"EscalationCase\" e JOIN \"User\" s ON s.id=e.\"studentId\" JOIN \"User\" rb ON rb.id=e.\"raisedById\" LEFT JOIN \"User\" ub ON ub.id=e.\"ruledById\" WHERE e.id=$1").bind(escalation_id).fetch_one(&state.db).await?;
    Ok(Json(json!({"escalation": escalation_json(&updated)})))
}

fn escalation_json(row: &sqlx::postgres::PgRow) -> serde_json::Value {
    let student_id: String = row.try_get("studentId").unwrap_or_default();
    let raised_id: String = row.try_get("raisedById").unwrap_or_default();
    let ruled_id: Option<String> = row.try_get("ruledById").unwrap_or(None);
    let ruled_by = ruled_id.as_ref().map(|id| json!({"id": id, "fullName": row.try_get::<Option<String>,_>("ruledName").unwrap_or(None), "role": row.try_get::<Option<String>,_>("ruledRole").unwrap_or(None)}));
    json!({
        "id": row.try_get::<String,_>("id").unwrap_or_default(),
        "sourceType": row.try_get::<String,_>("sourceType").unwrap_or_default(),
        "sourceId": row.try_get::<String,_>("sourceId").unwrap_or_default(),
        "raisedById": raised_id,
        "raisedBy": {"id": raised_id, "fullName": row.try_get::<Option<String>,_>("raisedName").unwrap_or(None), "role": row.try_get::<Option<String>,_>("raisedRole").unwrap_or(None)},
        "studentId": student_id,
        "student": {"id": student_id, "fullName": row.try_get::<String,_>("studentName").unwrap_or_default(), "email": row.try_get::<String,_>("studentEmail").unwrap_or_default(), "studentIdNo": row.try_get::<Option<String>,_>("studentIdNo").unwrap_or(None)},
        "summary": row.try_get::<String,_>("summary").unwrap_or_default(),
        "policyDetails": row.try_get::<String,_>("policyDetails").unwrap_or_default(),
        "status": row.try_get::<String,_>("status").unwrap_or_default(),
        "rulingNote": row.try_get::<Option<String>,_>("rulingNote").unwrap_or(None),
        "ruledById": ruled_id,
        "ruledBy": ruled_by,
        "ruledAt": row.try_get::<Option<chrono::DateTime<Utc>>,_>("ruledAt").ok().flatten().map(|d| d.to_rfc3339()),
        "createdAt": row.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
    })
}

async fn config_get(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<serde_json::Value>> {
    require_sa(&auth)?;
    sqlx::query(
        "INSERT INTO \"SystemConfig\" (id, \"updatedAt\") VALUES ('singleton', NOW()) ON CONFLICT (id) DO NOTHING",
    )
    .execute(&state.db)
    .await?;
    let row = sqlx::query("SELECT id,\"requiredPreOjtHours\",\"taskCategories\",\"creditRoundingRule\",\"allowSelfRegistration\",\"updatedAt\"::timestamptz FROM \"SystemConfig\" WHERE id='singleton'").fetch_one(&state.db).await?;
    Ok(Json(json!({"config": {
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

    let mut tx = state.db.begin().await?;
    sqlx::query(
        "INSERT INTO \"SystemConfig\" (id, \"updatedAt\") VALUES ('singleton', NOW()) ON CONFLICT (id) DO NOTHING",
    )
    .execute(&mut *tx)
    .await?;
    let previous = sqlx::query("SELECT \"requiredPreOjtHours\",\"taskCategories\",\"creditRoundingRule\",\"allowSelfRegistration\" FROM \"SystemConfig\" WHERE id='singleton'")
        .fetch_one(&mut *tx).await?;
    let mut any = false;
    if let Some(v) = body.get("requiredPreOjtHours").and_then(|x| x.as_f64()) {
        sqlx::query("UPDATE \"SystemConfig\" SET \"requiredPreOjtHours\"=$1,\"updatedAt\"=NOW() WHERE id='singleton'").bind(v).execute(&mut *tx).await?;
        any = true;
    }
    if let Some(v) = body.get("allowSelfRegistration").and_then(|x| x.as_bool()) {
        sqlx::query("UPDATE \"SystemConfig\" SET \"allowSelfRegistration\"=$1,\"updatedAt\"=NOW() WHERE id='singleton'").bind(v).execute(&mut *tx).await?;
        any = true;
    }
    if let Some(v) = body.get("creditRoundingRule").and_then(|x| x.as_str()) {
        sqlx::query("UPDATE \"SystemConfig\" SET \"creditRoundingRule\"=$1,\"updatedAt\"=NOW() WHERE id='singleton'").bind(v).execute(&mut *tx).await?;
        any = true;
    }
    if let Some(v) = body.get("taskCategories") {
        sqlx::query("UPDATE \"SystemConfig\" SET \"taskCategories\"=$1,\"updatedAt\"=NOW() WHERE id='singleton'").bind(v).execute(&mut *tx).await?;
        any = true;
    }
    if !any {
        return Err(AppError::BadRequest("Invalid config.".into()));
    }
    tx.commit().await?;
    let updated = sqlx::query("SELECT \"requiredPreOjtHours\",\"taskCategories\",\"creditRoundingRule\",\"allowSelfRegistration\",\"updatedAt\"::timestamptz FROM \"SystemConfig\" WHERE id='singleton'")
        .fetch_one(&state.db).await?;
    crate::audit::write_audit_log(&state, Some(&auth.0.sub), "SYSTEM_CONFIG_UPDATED", "SystemConfig", "singleton", json!({"changes": body, "previous": {"requiredPreOjtHours": previous.try_get::<f64,_>("requiredPreOjtHours")?, "taskCategories": previous.try_get::<serde_json::Value,_>("taskCategories")?, "creditRoundingRule": previous.try_get::<String,_>("creditRoundingRule")?, "allowSelfRegistration": previous.try_get::<bool,_>("allowSelfRegistration")?}})).await?;
    Ok(Json(json!({"config": {
        "requiredPreOjtHours": updated.try_get::<f64,_>("requiredPreOjtHours").unwrap_or(100.0),
        "taskCategories": updated.try_get::<serde_json::Value,_>("taskCategories").unwrap_or(json!([])),
        "creditRoundingRule": updated.try_get::<String,_>("creditRoundingRule").unwrap_or_default(),
        "allowSelfRegistration": updated.try_get::<bool,_>("allowSelfRegistration").unwrap_or(true),
        "updatedAt": updated.try_get::<chrono::DateTime<Utc>,_>("updatedAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
    }})))
}

async fn admins_list(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<AdminsQ>,
) -> Result<Json<serde_json::Value>> {
    require_sa(&auth)?;
    let (page, ps, skip) = super::normalize_pagination(q.page, q.page_size);
    let mut count_query =
        QueryBuilder::new("SELECT COUNT(*) AS c FROM \"User\" WHERE role::text='ADMIN'");
    let mut data_query = QueryBuilder::new("SELECT u.id,u.email,u.\"fullName\",u.phone,u.status::text,u.\"createdAt\"::timestamptz,(SELECT COUNT(*)::bigint FROM \"Batch\" b WHERE b.\"coordinatorId\"=u.id) AS \"coordinatedBatches\",(SELECT COUNT(*)::bigint FROM \"LabRoom\" r WHERE r.\"assignedAdminId\"=u.id) AS \"assignedRooms\" FROM \"User\" u WHERE u.role::text='ADMIN'");
    if let Some(search) = q.search.as_deref().filter(|s| !s.is_empty()) {
        let pattern = format!(
            "%{}%",
            search
                .replace('!', "!!")
                .replace('%', "!%")
                .replace('_', "!_")
        );
        count_query
            .push(" AND (\"fullName\" ILIKE ")
            .push_bind(pattern.clone())
            .push(" ESCAPE '!' OR email ILIKE ")
            .push_bind(pattern.clone())
            .push(" ESCAPE '!')");
        data_query
            .push(" AND (u.\"fullName\" ILIKE ")
            .push_bind(pattern.clone())
            .push(" ESCAPE '!' OR u.email ILIKE ")
            .push_bind(pattern.clone())
            .push(" ESCAPE '!')");
    }
    if let Some(status) = q
        .status
        .as_deref()
        .filter(|s| ["PENDING_VERIFICATION", "ACTIVE", "SUSPENDED", "DEACTIVATED"].contains(s))
    {
        count_query.push(" AND status::text=").push_bind(status);
        data_query.push(" AND u.status::text=").push_bind(status);
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
    let data: Vec<serde_json::Value> = rows.into_iter().map(|r| json!({
        "id": r.try_get::<String,_>("id").unwrap_or_default(),
        "fullName": r.try_get::<String,_>("fullName").unwrap_or_default(),
        "email": r.try_get::<String,_>("email").unwrap_or_default(),
        "phone": r.try_get::<Option<String>,_>("phone").unwrap_or(None),
        "status": r.try_get::<String,_>("status").unwrap_or_default(),
        "createdAt": r.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
        "coordinatedBatches": r.try_get::<i64,_>("coordinatedBatches").unwrap_or(0),
        "assignedRooms": r.try_get::<i64,_>("assignedRooms").unwrap_or(0),
    })).collect();
    Ok(Json(
        json!({"data": data, "page": page, "pageSize": ps, "total": total, "totalPages": (total as f64 / ps as f64).ceil() as i64}),
    ))
}

async fn admins_create(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<serde_json::Value>,
) -> Result<Response> {
    require_sa(&auth)?;
    #[derive(Deserialize)]
    struct B {
        email: String,
        #[serde(rename = "fullName")]
        full_name: String,
        password: String,
        phone: Option<String>,
        program: Option<String>,
        section: Option<String>,
    }
    let b: B =
        serde_json::from_value(body).map_err(|_| AppError::BadRequest("Invalid admin.".into()))?;
    if b.email.trim().is_empty()
        || !b.email.contains('@')
        || b.email.len() > 254
        || b.full_name.trim().chars().count() < 2
        || b.full_name.trim().chars().count() > 120
        || b.password.len() < 8
        || b.password.len() > 128
        || b.phone
            .as_deref()
            .is_some_and(|value| value.chars().count() > 40)
        || b.program
            .as_deref()
            .is_some_and(|value| value.chars().count() > 40)
        || b.section
            .as_deref()
            .is_some_and(|value| value.chars().count() > 40)
    {
        return Err(AppError::BadRequest("Invalid admin.".into()));
    }
    let email = b.email.trim().to_lowercase();
    let existing = sqlx::query("SELECT id FROM \"User\" WHERE email=$1")
        .bind(&email)
        .fetch_optional(&state.db)
        .await?;
    if existing.is_some() {
        return Err(AppError::Conflict("Email already exists.".into()));
    }
    let id = Uuid::new_v4().to_string();
    let hash = crate::auth::hash_password(&b.password)?;
    sqlx::query("INSERT INTO \"User\" (id,email,\"passwordHash\",\"fullName\",role,status,phone,program,section,\"createdAt\",\"updatedAt\",\"requiredHours\",\"preOjtCompleted\",\"failedLoginCount\") VALUES ($1,$2,$3,$4,'ADMIN','ACTIVE',$5,$6,$7,NOW(),NOW(),100,false,0)")
        .bind(&id).bind(&email).bind(&hash).bind(b.full_name.trim()).bind(b.phone.as_deref()).bind(b.program.as_deref()).bind(b.section.as_deref()).execute(&state.db).await?;
    crate::audit::write_audit_log(
        &state,
        Some(&auth.0.sub),
        "ADMIN_CREATED",
        "User",
        &id,
        json!({"email": email, "fullName": b.full_name.trim()}),
    )
    .await?;
    let created = sqlx::query("SELECT id,\"fullName\",email,role::text,status::text,\"createdAt\"::timestamptz FROM \"User\" WHERE id=$1").bind(&id).fetch_one(&state.db).await?;
    Ok((StatusCode::CREATED, Json(json!({"admin": {"id": created.try_get::<String,_>("id")?, "fullName": created.try_get::<String,_>("fullName")?, "email": created.try_get::<String,_>("email")?, "role": created.try_get::<String,_>("role")?, "status": created.try_get::<String,_>("status")?, "createdAt": created.try_get::<chrono::DateTime<Utc>,_>("createdAt")?.to_rfc3339()}}))).into_response())
}

async fn admins_patch(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>> {
    require_sa(&auth)?;
    let admin_id = body
        .get("adminId")
        .or_else(|| body.get("id"))
        .and_then(serde_json::Value::as_str)
        .filter(|id| !id.is_empty())
        .ok_or_else(|| AppError::BadRequest("Invalid admin id".into()))?;
    let full_name = body.get("fullName").and_then(serde_json::Value::as_str);
    let email = body
        .get("email")
        .and_then(serde_json::Value::as_str)
        .map(|value| value.trim().to_lowercase());
    let phone = body.get("phone");
    let status = body.get("status").and_then(serde_json::Value::as_str);
    if full_name.is_none() && email.is_none() && phone.is_none() && status.is_none() {
        return Err(AppError::BadRequest(
            "No fields to update were provided".into(),
        ));
    }
    if full_name
        .is_some_and(|name| name.trim().chars().count() < 2 || name.trim().chars().count() > 120)
    {
        return Err(AppError::BadRequest("Invalid full name".into()));
    }
    if email
        .as_deref()
        .is_some_and(|value| value.len() > 254 || !value.contains('@'))
    {
        return Err(AppError::BadRequest("Invalid email address".into()));
    }
    if phone
        .and_then(serde_json::Value::as_str)
        .is_some_and(|value| value.chars().count() > 40)
    {
        return Err(AppError::BadRequest("Invalid phone".into()));
    }
    if status.is_some_and(|value| value != "ACTIVE" && value != "DEACTIVATED") {
        return Err(AppError::BadRequest("Invalid admin status".into()));
    }
    let existing = sqlx::query(
        "SELECT id,email,status::text FROM \"User\" WHERE id=$1 AND role::text='ADMIN'",
    )
    .bind(admin_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;
    let previous_email: String = existing.try_get("email")?;
    let previous_status: String = existing.try_get("status")?;
    if let Some(email) = email.as_deref().filter(|email| *email != previous_email) {
        if sqlx::query("SELECT id FROM \"User\" WHERE email=$1 AND id<>$2")
            .bind(email)
            .bind(admin_id)
            .fetch_optional(&state.db)
            .await?
            .is_some()
        {
            return Err(AppError::Conflict(
                "An account with this email already exists".into(),
            ));
        }
    }
    let mut tx = state.db.begin().await?;
    if let Some(full_name) = full_name {
        sqlx::query("UPDATE \"User\" SET \"fullName\"=$1,\"updatedAt\"=NOW() WHERE id=$2")
            .bind(full_name.trim())
            .bind(admin_id)
            .execute(&mut *tx)
            .await?;
    }
    if let Some(email) = email.as_deref() {
        sqlx::query("UPDATE \"User\" SET email=$1,\"updatedAt\"=NOW() WHERE id=$2")
            .bind(email)
            .bind(admin_id)
            .execute(&mut *tx)
            .await?;
    }
    if let Some(phone) = phone {
        sqlx::query("UPDATE \"User\" SET phone=$1,\"updatedAt\"=NOW() WHERE id=$2")
            .bind(phone.as_str())
            .bind(admin_id)
            .execute(&mut *tx)
            .await?;
    }
    if let Some(status) = status {
        if status == "DEACTIVATED" {
            sqlx::query("UPDATE \"User\" SET status=$1::\"UserStatus\",\"lockedUntil\"=NULL,\"failedLoginCount\"=0,\"updatedAt\"=NOW() WHERE id=$2").bind(status).bind(admin_id).execute(&mut *tx).await?;
        } else {
            sqlx::query(
                "UPDATE \"User\" SET status=$1::\"UserStatus\",\"updatedAt\"=NOW() WHERE id=$2",
            )
            .bind(status)
            .bind(admin_id)
            .execute(&mut *tx)
            .await?;
        }
    }
    tx.commit().await?;
    let updated = sqlx::query(
        "SELECT id,\"fullName\",email,role::text,status::text FROM \"User\" WHERE id=$1",
    )
    .bind(admin_id)
    .fetch_one(&state.db)
    .await?;
    let action = if status.is_some_and(|status| status != previous_status) {
        "ADMIN_STATUS_CHANGED"
    } else {
        "ADMIN_UPDATED"
    };
    crate::audit::write_audit_log(&state, Some(&auth.0.sub), action, "User", admin_id, json!({"previousStatus": previous_status, "status": updated.try_get::<String,_>("status")?, "fields": body.as_object().map(|obj| obj.keys().cloned().collect::<Vec<_>>()).unwrap_or_default()})).await?;
    Ok(Json(
        json!({"admin": {"id": updated.try_get::<String,_>("id")?, "fullName": updated.try_get::<String,_>("fullName")?, "email": updated.try_get::<String,_>("email")?, "role": updated.try_get::<String,_>("role")?, "status": updated.try_get::<String,_>("status")?}}),
    ))
}
