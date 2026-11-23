use crate::audit::write_audit_log;
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

#[derive(Deserialize, Default)]
struct NotifQuery {
    page: Option<i64>,
    #[serde(rename = "pageSize")]
    page_size: Option<i64>,
    #[serde(rename = "unreadOnly")]
    unread_only: Option<bool>,
}

#[derive(Deserialize, Default)]
struct MarkReadInput {
    ids: Option<Vec<String>>,
    id: Option<String>,
    all: Option<bool>,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/api/notifications", get(list).patch(mark_read))
}

async fn list(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(q): Query<NotifQuery>,
) -> Result<Json<serde_json::Value>> {
    let page = q.page.unwrap_or(1).max(1);
    let mut ps = q.page_size.unwrap_or(15);
    if ![15, 25, 50].contains(&ps) {
        ps = 15;
    }
    let skip = (page - 1) * ps;
    let unread_only = q.unread_only.unwrap_or(false);
    let filter = if unread_only {
        " AND \"isRead\"=false"
    } else {
        ""
    };
    let rows = sqlx::query(&format!(
        "SELECT id,\"userId\",type::text,title,body,link,\"isRead\",\"createdAt\"::timestamptz FROM \"Notification\" WHERE \"userId\"=$1{} ORDER BY \"createdAt\"::timestamptz DESC LIMIT $2 OFFSET $3",
        filter
    ))
    .bind(&auth.0.sub).bind(ps).bind(skip).fetch_all(&state.db).await?;
    let total: i64 = sqlx::query(&format!(
        "SELECT COUNT(*) as c FROM \"Notification\" WHERE \"userId\"=$1{}",
        filter
    ))
    .bind(&auth.0.sub)
    .fetch_one(&state.db)
    .await?
    .try_get("c")
    .unwrap_or(0);
    let unread: i64 = sqlx::query(
        "SELECT COUNT(*) as c FROM \"Notification\" WHERE \"userId\"=$1 AND \"isRead\"=false",
    )
    .bind(&auth.0.sub)
    .fetch_one(&state.db)
    .await?
    .try_get("c")
    .unwrap_or(0);
    let items: Vec<serde_json::Value> = rows.into_iter().map(|r| json!({
        "id": r.try_get::<String,_>("id").unwrap_or_default(),
        "userId": r.try_get::<String,_>("userId").unwrap_or_default(),
        "type": r.try_get::<String,_>("type").unwrap_or_default(),
        "title": r.try_get::<String,_>("title").unwrap_or_default(),
        "body": r.try_get::<String,_>("body").unwrap_or_default(),
        "link": r.try_get::<Option<String>,_>("link").unwrap_or(None),
        "isRead": r.try_get::<bool,_>("isRead").unwrap_or(false),
        "createdAt": r.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
    })).collect();
    Ok(Json(
        json!({"data": items, "page": page, "pageSize": ps, "total": total, "totalPages": (total as f64 / ps as f64).ceil(), "unread": unread}),
    ))
}

async fn mark_read(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>> {
    let input: MarkReadInput =
        serde_json::from_value(body).map_err(|_| AppError::BadRequest("Invalid input".into()))?;
    if input.all.unwrap_or(false) {
        let res = sqlx::query(
            "UPDATE \"Notification\" SET \"isRead\"=true WHERE \"userId\"=$1 AND \"isRead\"=false",
        )
        .bind(&auth.0.sub)
        .execute(&state.db)
        .await?;
        write_audit_log(
            &state,
            Some(&auth.0.sub),
            "NOTIFICATIONS_MARK_READ",
            "Notification",
            "multiple",
            json!({"count": res.rows_affected()}),
        )
        .await
        .ok();
        return Ok(Json(json!({"markedRead": res.rows_affected()})));
    }
    let target_ids = input
        .ids
        .unwrap_or_else(|| input.id.map(|x| vec![x]).unwrap_or_default());
    if target_ids.is_empty() {
        return Err(AppError::BadRequest("No notification ids provided".into()));
    }
    // build IN clause safely
    let placeholders: Vec<String> = (1..=target_ids.len())
        .map(|i| format!("${}", i + 1))
        .collect();
    let sql = format!(
        "UPDATE \"Notification\" SET \"isRead\"=true WHERE id IN ({}) AND \"userId\"=$1",
        placeholders.join(",")
    );
    let mut q = sqlx::query(&sql).bind(&auth.0.sub);
    for id in &target_ids {
        q = q.bind(id);
    }
    let res = q.execute(&state.db).await?;
    write_audit_log(
        &state,
        Some(&auth.0.sub),
        "NOTIFICATIONS_MARK_READ",
        "Notification",
        "multiple",
        json!({"count": target_ids.len()}),
    )
    .await
    .ok();
    Ok(Json(json!({"markedRead": res.rows_affected()})))
}
