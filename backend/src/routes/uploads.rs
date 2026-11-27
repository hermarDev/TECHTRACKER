use crate::error::{AppError, Result};
use crate::middleware::AuthUser;
use crate::state::AppState;
use crate::storage::{read_field_capped, sniff_mime, MAX_UPLOAD_BYTES};
use axum::extract::{Multipart, State};
use axum::routing::post;
use axum::{Json, Router};
use serde_json::json;
use uuid::Uuid;

pub fn router() -> Router<AppState> {
    Router::new().route("/api/uploads", post(upload))
}

async fn upload(
    State(_state): State<AppState>,
    auth: AuthUser,
    mut multipart: Multipart,
) -> Result<Json<serde_json::Value>> {
    // Handle single file upload under field "file" or "photo"
    let mut file_bytes: Option<Vec<u8>> = None;
    let mut name: Option<String> = None;
    while let Some(mut field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let fname = field.name().unwrap_or("").to_string();
        if fname == "file" || fname == "photo" {
            name = field.file_name().map(|s| s.to_string());
            let bytes = read_field_capped(&mut field, MAX_UPLOAD_BYTES)
                .await
                .map_err(|e| AppError::BadRequest(e.into()))?;
            file_bytes = Some(bytes);
        }
    }
    let bytes = file_bytes.ok_or_else(|| AppError::BadRequest("No file provided.".into()))?;
    let (mime, ext) = sniff_mime(&bytes).ok_or_else(|| {
        AppError::BadRequest("Unsupported file type. Upload a JPEG, PNG, WebP, or PDF file.".into())
    })?;

    let key = format!("uploads/{}/{}{}", auth.0.sub, Uuid::new_v4(), ext);
    crate::storage::save_bytes(&key, &bytes)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let base_name = name.unwrap_or_else(|| format!("upload{}", ext));
    Ok(Json(
        json!({"key": key, "name": base_name, "mime": mime, "size": bytes.len()}),
    ))
}
