use crate::auth::SessionPayload;
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
    auth: AuthUser,
    State(state): State<AppState>,
    Path(key): Path<String>,
) -> Result<Response, AppError> {
    if auth.0.role != "SUPERADMIN" && !can_read(&state, &auth.0, &key).await? {
        return Err(AppError::NotFound);
    }

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

/// A key is readable only when the caller owns or coordinates the record that references it.
async fn can_read(state: &AppState, user: &SessionPayload, key: &str) -> Result<bool, AppError> {
    if let Some(rest) = key.strip_prefix("uploads/") {
        if rest.split('/').next() == Some(user.sub.as_str()) {
            return Ok(true);
        }
        let in_message = sqlx::query(
            "SELECT 1 FROM \"Message\" m JOIN \"ConversationMember\" cm ON cm.\"conversationId\"=m.\"conversationId\" WHERE m.\"attachmentKey\"=$1 AND cm.\"userId\"=$2 LIMIT 1",
        )
        .bind(key)
        .bind(&user.sub)
        .fetch_optional(&state.db)
        .await?;
        if in_message.is_some() {
            return Ok(true);
        }
        let in_inspection = sqlx::query(
            "SELECT 1 FROM \"InspectionItem\" ii JOIN \"Inspection\" i ON i.id=ii.\"inspectionId\" JOIN \"LabRoom\" r ON r.id=i.\"roomId\" WHERE ii.\"photoKey\"=$1 AND (r.\"assignedStudentId\"=$2 OR r.\"assignedAdminId\"=$2 OR i.\"inspectorId\"=$2 OR ($3 = 'ADMIN' AND r.\"assignedAdminId\" IS NULL)) LIMIT 1",
        )
        .bind(key)
        .bind(&user.sub)
        .bind(&user.role)
        .fetch_optional(&state.db)
        .await?;
        return Ok(in_inspection.is_some());
    }

    if key.starts_with("attendance/") {
        let row = sqlx::query(
            "SELECT 1 FROM \"AttendanceLog\" a JOIN \"Batch\" b ON b.id=a.\"batchId\" WHERE (a.\"photoInKey\"=$1 OR a.\"photoOutKey\"=$1) AND (a.\"studentId\"=$2 OR b.\"coordinatorId\"=$2) LIMIT 1",
        )
        .bind(key)
        .bind(&user.sub)
        .fetch_optional(&state.db)
        .await?;
        return Ok(row.is_some());
    }

    if key.starts_with("tasks/") {
        let row = sqlx::query(
            "SELECT 1 FROM \"TaskSubmission\" ts JOIN \"TaskAssignment\" ta ON ta.id=ts.\"assignmentId\" JOIN \"Task\" t ON t.id=ta.\"taskId\" WHERE ts.\"attachmentKeys\" @> to_jsonb($1::text) AND (ta.\"studentId\"=$2 OR t.\"createdById\"=$2 OR EXISTS (SELECT 1 FROM \"User\" u JOIN \"Batch\" b ON b.id=u.\"batchId\" WHERE u.id=ta.\"studentId\" AND b.\"coordinatorId\"=$2)) LIMIT 1",
        )
        .bind(key)
        .bind(&user.sub)
        .fetch_optional(&state.db)
        .await?;
        return Ok(row.is_some());
    }

    Ok(false)
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
