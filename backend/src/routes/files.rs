use crate::error::AppError;
use crate::middleware::AuthUser;
use crate::state::AppState;
use axum::body::Body;
use axum::extract::{Path, State};
use axum::http::{header, StatusCode};
use axum::response::Response;
use axum::routing::get;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new().route("/api/files/*key", get(serve))
}

async fn serve(
    _auth: AuthUser,
    State(_): State<AppState>,
    Path(key): Path<String>,
) -> Result<Response, AppError> {
    let path = crate::storage::resolve_path(&key)
        .ok_or_else(|| AppError::BadRequest("Invalid file key.".into()))?;

    let root = tokio::fs::canonicalize(crate::storage::storage_root())
        .await
        .map_err(|_| AppError::NotFound)?;
    let real = tokio::fs::canonicalize(&path)
        .await
        .map_err(|_| AppError::NotFound)?;
    if !real.starts_with(&root) {
        return Err(AppError::Forbidden);
    }

    let bytes = tokio::fs::read(&real)
        .await
        .map_err(|_| AppError::NotFound)?;

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime_guess(&key))
        .header("x-content-type-options", "nosniff")
        .header(header::CACHE_CONTROL, "private, max-age=0")
        .body(Body::from(bytes))
        .map_err(|e| AppError::Internal(e.to_string()))
}

fn mime_guess(key: &str) -> &'static str {
    let lower = key.to_ascii_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".pdf") {
        "application/pdf"
    } else if lower.ends_with(".csv") {
        "text/csv; charset=utf-8"
    } else if lower.ends_with(".txt") {
        "text/plain; charset=utf-8"
    } else if lower.ends_with(".xlsx") {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    } else if lower.ends_with(".docx") {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    } else {
        "application/octet-stream"
    }
}

#[cfg(test)]
mod tests {
    use super::mime_guess;

    #[test]
    fn guesses_supported_types() {
        assert_eq!(mime_guess("a.PNG"), "image/png");
        assert_eq!(mime_guess("a.jpeg"), "image/jpeg");
        assert_eq!(mime_guess("a.pdf"), "application/pdf");
        assert_eq!(mime_guess("a.csv"), "text/csv; charset=utf-8");
        assert_eq!(
            mime_guess("a.xlsx"),
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
    }

    #[test]
    fn defaults_to_octet_stream() {
        assert_eq!(mime_guess("a.exe"), "application/octet-stream");
        assert_eq!(mime_guess("a.svg"), "application/octet-stream");
    }
}
