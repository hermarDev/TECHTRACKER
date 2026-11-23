use std::env;

const DEV_JWT_SECRET: &str = "techtracker-local-dev-secret-change-me";
const DEV_DATABASE_URL: &str = "postgresql://techtracker:techtracker@127.0.0.1:5444/techtracker";
const DEFAULT_APP_URL: &str = "http://127.0.0.1:3219";

#[derive(Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub app_url: String,
    pub env: String,
    pub enable_dev_outbox: bool,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let env = env::var("APP_ENV")
            .ok()
            .filter(|v| !v.is_empty())
            .or_else(|| env::var("NODE_ENV").ok().filter(|v| !v.is_empty()))
            .unwrap_or_else(|| "development".to_string());
        let is_prod = env == "production";

        let database_url = env::var("DATABASE_URL")
            .ok()
            .filter(|v| !v.is_empty())
            .or_else(|| {
                if is_prod {
                    None
                } else {
                    Some(DEV_DATABASE_URL.to_string())
                }
            })
            .ok_or_else(|| anyhow::anyhow!("DATABASE_URL is required in production"))?;

        let jwt_secret = env::var("JWT_SECRET")
            .ok()
            .filter(|v| !v.is_empty())
            .or_else(|| {
                if is_prod {
                    None
                } else {
                    Some(DEV_JWT_SECRET.to_string())
                }
            })
            .ok_or_else(|| anyhow::anyhow!("JWT_SECRET is required in production"))?;
        validate_production(&env, &jwt_secret)?;

        let app_url = env::var("APP_URL")
            .ok()
            .filter(|v| !v.is_empty())
            .or_else(|| {
                env::var("NEXT_PUBLIC_APP_URL")
                    .ok()
                    .filter(|v| !v.is_empty())
            })
            .unwrap_or_else(|| DEFAULT_APP_URL.to_string());

        let enable_dev_outbox = env::var("ENABLE_DEV_OUTBOX")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false);

        Ok(Self {
            database_url,
            jwt_secret,
            app_url,
            env,
            enable_dev_outbox,
        })
    }

    pub fn is_prod(&self) -> bool {
        self.env == "production"
    }
}

fn validate_production(env: &str, jwt_secret: &str) -> anyhow::Result<()> {
    if env == "production" && (jwt_secret == DEV_JWT_SECRET || jwt_secret.len() < 32) {
        anyhow::bail!("JWT_SECRET must be a strong value (>= 32 chars) in production");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{validate_production, DEV_JWT_SECRET};

    #[test]
    fn production_rejects_dev_or_short_secrets() {
        assert!(validate_production("production", DEV_JWT_SECRET).is_err());
        assert!(validate_production("production", "short").is_err());
        assert!(validate_production("production", &"x".repeat(32)).is_ok());
    }

    #[test]
    fn development_accepts_dev_secret() {
        assert!(validate_production("development", DEV_JWT_SECRET).is_ok());
    }
}
