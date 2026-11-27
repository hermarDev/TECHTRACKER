use crate::config::Config;
use crate::error::AppError;
use bcrypt::{hash, verify};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

pub const SESSION_COOKIE_NAME: &str = "techtracker_session";
pub const SESSION_MAX_AGE_SECONDS: i64 = 12 * 60 * 60;
pub const MAX_FAILED_LOGIN_ATTEMPTS: i32 = 5;
pub const LOCKOUT_DURATION_MS: i64 = 15 * 60 * 1000;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SessionPayload {
    pub sub: String,
    pub email: String,
    #[serde(rename = "fullName")]
    pub full_name: String,
    pub role: String,
    #[serde(rename = "batchId")]
    pub batch_id: Option<String>,
    #[serde(rename = "tv", default)]
    pub token_version: i32,
}

pub fn hash_password(plain: &str) -> Result<String, AppError> {
    hash(plain, 10).map_err(|e| AppError::Internal(e.to_string()))
}

pub fn verify_password(plain: &str, hashed: &str) -> bool {
    verify(plain, hashed).unwrap_or(false)
}

pub fn sign_session_jwt(config: &Config, payload: &SessionPayload) -> Result<String, AppError> {
    let now = Utc::now();
    let exp = (now + Duration::seconds(SESSION_MAX_AGE_SECONDS)).timestamp() as usize;
    #[derive(Serialize)]
    struct Claims {
        sub: String,
        email: String,
        #[serde(rename = "fullName")]
        full_name: String,
        role: String,
        #[serde(rename = "batchId")]
        batch_id: Option<String>,
        #[serde(rename = "tv")]
        token_version: i32,
        iat: usize,
        exp: usize,
    }
    let claims = Claims {
        sub: payload.sub.clone(),
        email: payload.email.clone(),
        full_name: payload.full_name.clone(),
        role: payload.role.clone(),
        batch_id: payload.batch_id.clone(),
        token_version: payload.token_version,
        iat: now.timestamp() as usize,
        exp,
    };
    let key = EncodingKey::from_secret(config.jwt_secret.as_bytes());
    encode(&Header::default(), &claims, &key).map_err(|e| AppError::Internal(e.to_string()))
}

pub fn verify_session_jwt(config: &Config, token: &str) -> Option<SessionPayload> {
    let key = DecodingKey::from_secret(config.jwt_secret.as_bytes());
    let mut validation = Validation::default();
    validation.validate_exp = true;
    let data = decode::<serde_json::Value>(token, &key, &validation).ok()?;
    let v = data.claims;
    let sub = v.get("sub")?.as_str()?.to_string();
    let email = v.get("email")?.as_str()?.to_string();
    let full_name = v
        .get("fullName")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let role = v.get("role")?.as_str()?.to_string();
    let batch_id = v
        .get("batchId")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    let token_version = v.get("tv").and_then(|x| x.as_i64()).unwrap_or(0) as i32;
    Some(SessionPayload {
        sub,
        email,
        full_name,
        role,
        batch_id,
        token_version,
    })
}

/// Returns (locked, minutes_remaining, effective_failed_count). An expired
/// lockout resets the counter so one wrong password cannot immediately re-lock.
pub fn evaluate_lockout(
    failed: i32,
    locked_until: Option<chrono::DateTime<Utc>>,
    now: chrono::DateTime<Utc>,
) -> (bool, i64, i32) {
    if let Some(lu) = locked_until {
        if lu > now {
            let mins = ((lu - now).num_seconds() + 59) / 60;
            return (true, mins, failed);
        }
        return (false, 0, 0);
    }
    (false, 0, failed)
}

pub fn next_failure(
    current: i32,
    now: chrono::DateTime<Utc>,
) -> (i32, Option<chrono::DateTime<Utc>>, bool, i32) {
    let next = current + 1;
    if next >= MAX_FAILED_LOGIN_ATTEMPTS {
        let locked = now + Duration::milliseconds(LOCKOUT_DURATION_MS);
        (next, Some(locked), true, 0)
    } else {
        (next, None, false, MAX_FAILED_LOGIN_ATTEMPTS - next)
    }
}

pub fn create_opaque_token() -> (String, String) {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: [u8; 24] = rng.gen();
    let raw = hex::encode(bytes);
    use sha2::{Digest, Sha256};
    let hash = hex::encode(Sha256::digest(raw.as_bytes()));
    (raw, hash)
}

pub fn hash_token(raw: &str) -> String {
    use sha2::{Digest, Sha256};
    hex::encode(Sha256::digest(raw.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expired_lockout_resets_the_failure_counter() {
        let now = Utc::now();
        let expired = now - Duration::minutes(1);
        let (locked, mins, failed) = evaluate_lockout(5, Some(expired), now);
        assert!(!locked);
        assert_eq!(mins, 0);
        assert_eq!(failed, 0);
        let (next, lock, triggered, remaining) = next_failure(failed, now);
        assert_eq!(next, 1);
        assert!(lock.is_none());
        assert!(!triggered);
        assert_eq!(remaining, MAX_FAILED_LOGIN_ATTEMPTS - 1);
    }

    #[test]
    fn active_lockout_keeps_the_counter_and_reports_minutes() {
        let now = Utc::now();
        let (locked, mins, failed) = evaluate_lockout(5, Some(now + Duration::minutes(5)), now);
        assert!(locked);
        assert!(mins >= 5);
        assert_eq!(failed, 5);
    }

    #[test]
    fn password_hashing_verifies_and_token_hashing_is_stable() {
        let hash = hash_password("CorrectHorse1").unwrap();
        assert!(verify_password("CorrectHorse1", &hash));
        assert!(!verify_password("WrongHorse1", &hash));
        let (raw, stored) = create_opaque_token();
        assert_eq!(hash_token(&raw), stored);
    }
}
