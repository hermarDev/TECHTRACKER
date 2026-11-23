use crate::error::AppError;
use crate::state::AppState;
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::json;
use sqlx::Row;
use std::collections::HashMap;

pub fn router() -> Router<AppState> {
    Router::new().route("/api/dev/outbox", get(outbox))
}

async fn outbox(
    State(state): State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<(StatusCode, Json<serde_json::Value>), AppError> {
    if state.config.is_prod() && !state.config.enable_dev_outbox {
        return Err(AppError::NotFound);
    }

    let limit = params
        .get("limit")
        .and_then(|v| v.parse::<i64>().ok())
        .map(|n| n.clamp(1, 100))
        .unwrap_or(50);

    let rows = sqlx::query(
        "SELECT id, \"toEmail\", subject, body, category, \"createdAt\"::timestamptz \
         FROM \"EmailOutbox\" ORDER BY \"createdAt\"::timestamptz DESC LIMIT $1",
    )
    .bind(limit)
    .fetch_all(&state.db)
    .await?;

    let emails: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|row| {
            json!({
                "id": row.try_get::<String,_>("id").unwrap_or_default(),
                "toEmail": row.try_get::<String,_>("toEmail").unwrap_or_default(),
                "subject": row.try_get::<String,_>("subject").unwrap_or_default(),
                "body": row.try_get::<String,_>("body").unwrap_or_default(),
                "category": row.try_get::<String,_>("category").unwrap_or_default(),
                "createdAt": row
                    .try_get::<chrono::DateTime<chrono::Utc>,_>("createdAt")
                    .map(|d| d.to_rfc3339())
                    .unwrap_or_default(),
            })
        })
        .collect();

    let total = emails.len();
    Ok((
        StatusCode::OK,
        Json(json!({ "emails": emails, "total": total })),
    ))
}
