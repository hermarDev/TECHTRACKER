use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;

pub fn max_connections() -> u32 {
    std::env::var("DB_MAX_CONNECTIONS")
        .ok()
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(25)
        .clamp(1, 100)
}

pub async fn create_pool(database_url: &str) -> anyhow::Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(max_connections())
        .connect(database_url)
        .await?;
    Ok(pool)
}

#[cfg(test)]
mod tests {
    use super::max_connections;

    #[test]
    fn default_and_bounds_are_sane() {
        let value = max_connections();
        assert!((1..=100).contains(&value));
    }
}
