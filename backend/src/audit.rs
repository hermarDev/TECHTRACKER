use crate::error::AppError;
use crate::state::AppState;
use serde_json::Value;

pub async fn write_audit_log(
    state: &AppState,
    actor_id: Option<&str>,
    action: &str,
    entity_type: &str,
    entity_id: &str,
    details: Value,
) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO \"AuditLog\" (id, \"actorId\", action, \"entityType\", \"entityId\", details, \"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,NOW())"
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(actor_id)
    .bind(action)
    .bind(entity_type)
    .bind(entity_id)
    .bind(details)
    .execute(&state.db)
    .await?;
    Ok(())
}

pub async fn write_audit_log_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    actor_id: Option<&str>,
    action: &str,
    entity_type: &str,
    entity_id: &str,
    details: Value,
) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO \"AuditLog\" (id, \"actorId\", action, \"entityType\", \"entityId\", details, \"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,NOW())"
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(actor_id)
    .bind(action)
    .bind(entity_type)
    .bind(entity_id)
    .bind(details)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn queue_email_outbox(
    state: &AppState,
    to_email: &str,
    subject: &str,
    category: &str,
    body: &str,
) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO \"EmailOutbox\" (id, \"toEmail\", subject, body, category, \"createdAt\") VALUES ($1,$2,$3,$4,$5,NOW())"
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(to_email)
    .bind(subject)
    .bind(body)
    .bind(category)
    .execute(&state.db)
    .await?;
    Ok(())
}

#[allow(dead_code)]
pub async fn queue_email_outbox_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    to_email: &str,
    subject: &str,
    category: &str,
    body: &str,
) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO \"EmailOutbox\" (id, \"toEmail\", subject, body, category, \"createdAt\") VALUES ($1,$2,$3,$4,$5,NOW())"
    )
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(to_email)
    .bind(subject)
    .bind(body)
    .bind(category)
    .execute(&mut **tx)
    .await?;
    Ok(())
}
