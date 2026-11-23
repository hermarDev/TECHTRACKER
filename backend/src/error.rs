use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("unauthorized")]
    Unauthorized,
    #[error("forbidden")]
    Forbidden,
    #[error("not found")]
    NotFound,
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("internal: {0}")]
    Internal(String),
    #[error("db error: {0}")]
    Db(#[from] sqlx::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, body) = match self {
            AppError::BadRequest(m) => (StatusCode::BAD_REQUEST, json!({"error": m})),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, json!({"error": "Unauthorized"})),
            AppError::Forbidden => (StatusCode::FORBIDDEN, json!({"error": "Forbidden"})),
            AppError::NotFound => (StatusCode::NOT_FOUND, json!({"error": "Not found"})),
            AppError::Conflict(m) => (StatusCode::CONFLICT, json!({"error": m})),
            AppError::Internal(m) => {
                tracing::error!("internal error: {m}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    json!({"error": "Internal server error"}),
                )
            }
            AppError::Db(e) => {
                tracing::error!("database error: {e}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    json!({"error": "Internal server error"}),
                )
            }
        };
        (status, Json(body)).into_response()
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
