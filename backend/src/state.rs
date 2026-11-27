use crate::config::Config;
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Shared, in-memory sliding-window limiter. Keys include the client IP and
/// either the email or the action, so a burst cannot exhaust other accounts.
#[derive(Clone, Default)]
pub struct RateLimiter {
    hits: Arc<Mutex<HashMap<String, Vec<Instant>>>>,
}

impl RateLimiter {
    pub fn allow(&self, key: &str, max: usize, window: Duration) -> bool {
        let now = Instant::now();
        let mut guard = match self.hits.lock() {
            Ok(g) => g,
            Err(_) => return false,
        };
        let entry = guard.entry(key.to_string()).or_default();
        entry.retain(|at| now.duration_since(*at) < window);
        if entry.len() >= max {
            return false;
        }
        entry.push(now);
        true
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
            rate_limiter: RateLimiter::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::RateLimiter;
    use std::time::Duration;

    #[test]
    fn rate_limiter_blocks_bursts_and_recovers_after_window() {
        let limiter = RateLimiter::default();
        for _ in 0..3 {
            assert!(limiter.allow("ip:user@example.test", 3, Duration::from_millis(10)));
        }
        assert!(!limiter.allow("ip:user@example.test", 3, Duration::from_millis(10)));
        assert!(limiter.allow("ip:other@example.test", 3, Duration::from_millis(10)));
        std::thread::sleep(Duration::from_millis(20));
        assert!(limiter.allow("ip:user@example.test", 3, Duration::from_millis(10)));
    }
}
