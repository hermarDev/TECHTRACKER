use crate::auth::{verify_session_jwt, SessionPayload, SESSION_COOKIE_NAME};
use crate::error::AppError;
use crate::state::AppState;
use axum::async_trait;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use sqlx::Row;

#[derive(Clone, Debug)]
pub struct AuthUser(pub SessionPayload);

#[async_trait]
impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;
    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        // cookie first
        let mut token: Option<String> = None;
        let cookie_prefix = format!("{SESSION_COOKIE_NAME}=");
        if let Some(cookie) = parts.headers.get(axum::http::header::COOKIE) {
            if let Ok(s) = cookie.to_str() {
                for part in s.split(';') {
                    let part = part.trim();
                    if let Some(rest) = part.strip_prefix(&cookie_prefix) {
                        token = Some(rest.to_string());
                    }
                }
            }
        }
        if token.is_none() {
            if let Some(auth) = parts.headers.get(axum::http::header::AUTHORIZATION) {
                if let Ok(s) = auth.to_str() {
                    if let Some(rest) = s.strip_prefix("Bearer ") {
                        token = Some(rest.to_string());
                    }
                }
            }
        }
        let token = token.ok_or(AppError::Unauthorized)?;
        let payload = verify_session_jwt(&state.config, &token).ok_or(AppError::Unauthorized)?;

        // A valid signature is not enough: suspended or deleted users must lose access immediately,
        // and role/batch claims must match the database rather than a stale token.
        let row = sqlx::query(
            "SELECT status::text, role::text, \"batchId\", \"tokenVersion\" FROM \"User\" WHERE id = $1",
        )
        .bind(&payload.sub)
        .fetch_optional(&state.db)
        .await?;
        let row = row.ok_or(AppError::Unauthorized)?;
        let status: String = row.try_get("status")?;
        if status != "ACTIVE" {
            return Err(AppError::Unauthorized);
        }
        let db_tv: i32 = row.try_get("tokenVersion")?;
        if db_tv != payload.token_version {
            return Err(AppError::Unauthorized);
        }
        let mut payload = payload;
        payload.role = row.try_get("role")?;
        payload.batch_id = row.try_get("batchId").unwrap_or(None);

        Ok(AuthUser(payload))
    }
}
