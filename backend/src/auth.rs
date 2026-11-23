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
        iat: usize,
        exp: usize,
    }
    let claims = Claims {
        sub: payload.sub.clone(),
        email: payload.email.clone(),
        full_name: payload.full_name.clone(),
        role: payload.role.clone(),
        batch_id: payload.batch_id.clone(),
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
    Some(SessionPayload {
        sub,
        email,
        full_name,
        role,
        batch_id,
    })
}

pub fn evaluate_lockout(
    _failed: i32,
    locked_until: Option<chrono::DateTime<Utc>>,
    now: chrono::DateTime<Utc>,
) -> (bool, i64) {
    if let Some(lu) = locked_until {
        if lu > now {
            let mins = ((lu - now).num_seconds() + 59) / 60;
            return (true, mins);
        }
    }
    (false, 0)
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
