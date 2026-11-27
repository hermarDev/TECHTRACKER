pub mod admin;
pub mod attendance;
pub mod auth;
pub mod files;
pub mod inspections;
pub mod messages;
pub mod notifications;
pub mod profile;
pub mod superadmin;
pub mod tasks;
pub mod uploads;

use crate::state::AppState;
use axum::extract::State;
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::json;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/health", get(health))
        .merge(auth::router())
        .merge(profile::router())
        .merge(attendance::router())
        .merge(tasks::router())
        .merge(inspections::router())
        .merge(messages::router())
        .merge(notifications::router())
        .merge(admin::router())
        .merge(superadmin::router())
        .merge(uploads::router())
        .merge(files::router())
}

async fn health(State(state): State<AppState>) -> (StatusCode, Json<serde_json::Value>) {
    match sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&state.db)
        .await
    {
        Ok(1) => (StatusCode::OK, Json(json!({"status": "ok", "db": "ok"}))),
        Ok(_) | Err(_) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({"status": "error", "db": "error"})),
        ),
    }
}
