use crate::error::{AppError, Result};
use crate::middleware::AuthUser;
use crate::state::AppState;
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
    _auth: AuthUser,
    mut multipart: Multipart,
) -> Result<Json<serde_json::Value>> {
    // Handle single file upload under field "file" or "photo"
    let mut file_bytes: Option<Vec<u8>> = None;
    let mut mime: Option<String> = None;
    let mut name: Option<String> = None;
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let fname = field.name().unwrap_or("").to_string();
        if fname == "file" || fname == "photo" {
            name = field.file_name().map(|s| s.to_string());
            mime = field.content_type().map(|s| s.to_string());
            let bytes = field
                .bytes()
                .await
                .map_err(|e| AppError::BadRequest(e.to_string()))?;
            file_bytes = Some(bytes.to_vec());
        }
    }
    let bytes = file_bytes.ok_or_else(|| AppError::BadRequest("No file provided.".into()))?;
    let mime = mime.unwrap_or_else(|| "application/octet-stream".to_string());
    let allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if !allowed.contains(&mime.as_str()) {
        return Err(AppError::BadRequest(format!(
            "Unsupported file type ({}).",
            mime
        )));
    }
    if bytes.is_empty() || bytes.len() > 5 * 1024 * 1024 {
        return Err(AppError::BadRequest(
            "File exceeds maximum allowed size of 5 MB.".into(),
        ));
    }

    let ext = match mime.as_str() {
        "image/png" => ".png",
        "image/webp" => ".webp",
        "application/pdf" => ".pdf",
        _ => ".jpg",
    };
    let key = format!("uploads/{}{}", Uuid::new_v4(), ext);
    crate::storage::save_bytes(&key, &bytes)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    let base_name = name.unwrap_or_else(|| format!("upload{}", ext));
    Ok(Json(
        json!({"key": key, "name": base_name, "mime": mime, "size": bytes.len()}),
    ))
}
