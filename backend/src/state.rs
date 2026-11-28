use crate::config::Config;
use chrono::{Duration, Utc};
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

/// Shared, database-backed sliding-window limiter. One row is one failed
/// attempt; Postgres is the shared state so every backend process sees it.
#[derive(Clone, Default)]
pub struct RateLimiter;

impl RateLimiter {
    pub async fn allow(
        &self,
        db: &PgPool,
        key: &str,
        max: i64,
        window: Duration,
    ) -> Result<bool, sqlx::Error> {
        let now = Utc::now();
        let cutoff = now - window;
        let mut tx = db.begin().await?;
        sqlx::query("DELETE FROM \"RateLimitHit\" WHERE \"bucketKey\"=$1 AND \"attemptedAt\" < $2")
            .bind(key)
            .bind(cutoff)
            .execute(&mut *tx)
            .await?;
        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM \"RateLimitHit\" WHERE \"bucketKey\"=$1")
                .bind(key)
                .fetch_one(&mut *tx)
                .await?;
        if count >= max {
            tx.rollback().await?;
            return Ok(false);
        }
        sqlx::query(
            "INSERT INTO \"RateLimitHit\" (id,\"bucketKey\",\"attemptedAt\") VALUES ($1,$2,$3)",
        )
        .bind(Uuid::new_v4().to_string())
        .bind(key)
        .bind(now)
        .execute(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(true)
    }
}

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub db: PgPool,
    pub rate_limiter: RateLimiter,
}

impl AppState {
    pub fn new(config: Config, db: PgPool) -> Self {
        Self {
            config: Arc::new(config),
            db,
            rate_limiter: RateLimiter,
        }
    }
}
