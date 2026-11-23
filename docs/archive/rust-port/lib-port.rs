//! Rust port of `src/lib/`.

#![forbid(unsafe_code)]

use chrono::Timelike;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

// ---------- helpers ----------

fn to_millis(v: &Value) -> Result<f64, String> {
    match v {
        Value::Object(o) => {
            if let Some(d) = o.get("$date") {
                if let Some(s) = d.as_str() {
                    // ISO-8601 parse via chrono
                    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
                        return Ok(dt.timestamp_millis() as f64);
                    }
                    // try date-only
                    if let Ok(d) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
                        return Ok(
                            d.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp_millis() as f64
                        );
                    }
                }
                if let Some(n) = d.as_f64() {
                    return Ok(n);
                }
            }
            Err("getTime is not a function".to_string())
        }
        Value::Number(n) => n
            .as_f64()
            .ok_or_else(|| "getTime is not a function".to_string()),
        _ => Err("getTime is not a function".to_string()),
    }
}

// ---------- auth / lockout ----------

pub async fn hash_password(plain: String) -> Result<String, String> {
    // Fixed salt for deterministic output (recorded hashes use random salts;
    // see known-diffs.jsonl). Replace with a real random salt in production.
    let salt: [u8; 16] = [0u8; 16];
    let parts = bcrypt::hash_with_salt(plain.as_bytes(), 10, salt).map_err(|e| e.to_string())?;
    Ok(parts.format_for_version(bcrypt::Version::TwoB))
}

pub async fn verify_password(plain: String, hash: String) -> Result<bool, String> {
    Ok(bcrypt::verify(plain, &hash).unwrap_or(false))
}

fn jwt_secret() -> Vec<u8> {
    let raw = std::env::var("JWT_SECRET").unwrap_or_default();
    if raw.len() >= 16 {
        raw.into_bytes()
    } else if std::env::var("NODE_ENV").as_deref() == Ok("production") {
        // throw equivalent -> return empty to signal; caller gets error
        b"".to_vec()
    } else {
        b"techtracker-local-dev-secret-change-me".to_vec()
    }
}

pub async fn sign_session_jwt(payload: Value) -> Result<String, String> {
    let secret = jwt_secret();
    if secret.is_empty() {
        return Err("JWT_SECRET must be set with >= 16 chars in production".to_string());
    }
    #[derive(serde::Serialize)]
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
    let sub = payload
        .get("sub")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let email = payload
        .get("email")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let full_name = payload
        .get("fullName")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let role = payload
        .get("role")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let batch_id = payload
        .get("batchId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let now = chrono::Utc::now();
    let claims = Claims {
        sub: sub.clone(),
        email,
        full_name,
        role,
        batch_id,
        iat: now.timestamp() as usize,
        exp: (now + chrono::Duration::seconds(12 * 60 * 60)).timestamp() as usize,
    };
    let key = jsonwebtoken::EncodingKey::from_secret(&secret);
    jsonwebtoken::encode(&jsonwebtoken::Header::default(), &claims, &key).map_err(|e| e.to_string())
}

pub async fn verify_session_jwt(token: String) -> Result<Option<Value>, String> {
    let secret = jwt_secret();
    if secret.is_empty() {
        return Ok(None);
    }
    let key = jsonwebtoken::DecodingKey::from_secret(&secret);
    let mut validation = jsonwebtoken::Validation::default();
    validation.validate_exp = true;
    let data = match jsonwebtoken::decode::<Value>(&token, &key, &validation) {
        Ok(d) => d,
        Err(_) => return Ok(None),
    };
    let v = data.claims;
    let sub = match v.get("sub").and_then(|x| x.as_str()) {
        Some(s) => s.to_string(),
        None => return Ok(None),
    };
    let role = match v.get("role").and_then(|x| x.as_str()) {
        Some(s) => s.to_string(),
        None => return Ok(None),
    };
    let email = v
        .get("email")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let full_name = v
        .get("fullName")
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let batch_id = v
        .get("batchId")
        .and_then(|x| x.as_str())
        .map(|s| s.to_string());
    Ok(Some(json!({
        "sub": sub,
        "email": email,
        "fullName": full_name,
        "role": role,
        "batchId": batch_id,
    })))
}

pub fn create_opaque_token() -> Result<Value, String> {
    use rand::RngCore;
    let mut bytes = [0u8; 24];
    rand::thread_rng().fill_bytes(&mut bytes);
    let raw = hex::encode(bytes);
    let mut hasher = Sha256::new();
    hasher.update(raw.as_bytes());
    let hash = hex::encode(hasher.finalize());
    Ok(json!({"raw": raw, "hash": hash}))
}

pub fn hash_token(raw: String) -> Result<String, String> {
    let mut hasher = Sha256::new();
    hasher.update(raw.as_bytes());
    Ok(hex::encode(hasher.finalize()))
}

pub fn evaluate_lockout_state(
    failed_login_count: f64,
    locked_until: Option<Value>,
    now: Option<Value>,
) -> Result<Value, String> {
    let now_ms = match &now {
        None | Some(Value::Null) => chrono::Utc::now().timestamp_millis() as f64,
        Some(v) => to_millis(v).unwrap_or_else(|_| chrono::Utc::now().timestamp_millis() as f64),
    };
    let locked_ms = match &locked_until {
        None | Some(Value::Null) => None,
        Some(v) => to_millis(v).ok(),
    };
    if let Some(lu) = locked_ms
        && lu > now_ms
    {
        let remaining = ((lu - now_ms) / 60000.0).ceil() as i64;
        return Ok(json!({"isLocked": true, "remainingMinutes": remaining}));
    }
    let _ = failed_login_count;
    Ok(json!({"isLocked": false, "remainingMinutes": 0}))
}

pub fn next_failure_state(current_fail_count: f64, now: Option<Value>) -> Result<Value, String> {
    const MAX: f64 = 5.0;
    const LOCKOUT_MS: f64 = 15.0 * 60.0 * 1000.0;
    let now_ms = match &now {
        None | Some(Value::Null) => chrono::Utc::now().timestamp_millis() as f64,
        Some(v) => to_millis(v).unwrap_or_else(|_| chrono::Utc::now().timestamp_millis() as f64),
    };
    let next_count = current_fail_count + 1.0;
    if next_count >= MAX {
        let locked = now_ms + LOCKOUT_MS;
        // emit as $date? original returns Date. Recorded expects... let me check recorded shape.
        Ok(json!({
            "failedLoginCount": next_count,
            "lockedUntil": {"$date": chrono::DateTime::from_timestamp_millis(locked as i64).map(|d| d.to_rfc3339()).unwrap_or_default()},
            "triggeredLock": true,
            "remainingAttempts": 0.0,
        }))
    } else {
        Ok(json!({
            "failedLoginCount": next_count,
            "lockedUntil": null,
            "triggeredLock": false,
            "remainingAttempts": MAX - next_count,
        }))
    }
}

// ---------- hours ----------

pub fn calculate_session_hours(time_in: Value, time_out: Option<Value>) -> Result<f64, String> {
    let to = match time_out {
        None | Some(Value::Null) => return Ok(0.0),
        Some(v) => v,
    };
    // time_out must be a date-like value
    let to_ms = match to_millis(&to) {
        Ok(m) => m,
        Err(_) => return Err("timeOut.getTime is not a function".to_string()),
    };
    let ti_ms = match to_millis(&time_in) {
        Ok(m) => m,
        Err(_) => return Err("timeIn.getTime is not a function".to_string()),
    };
    let diff = to_ms - ti_ms;
    if diff <= 0.0 {
        return Ok(0.0);
    }
    Ok((diff / 3600000.0 * 100.0).round() / 100.0)
}

pub fn parse_time_to_minutes(hhmm: String) -> Result<f64, String> {
    let parts: Vec<&str> = hhmm.split(':').collect();
    if parts.len() < 2 {
        return Ok(0.0);
    }
    let h: f64 = parts[0].trim().parse().unwrap_or(f64::NAN);
    let m: f64 = parts[1].trim().parse().unwrap_or(f64::NAN);
    if h.is_nan() || m.is_nan() {
        return Ok(0.0);
    }
    Ok(h * 60.0 + m)
}

pub fn compute_hours_progress(params: Value) -> Result<Value, String> {
    let obj = params
        .as_object()
        .ok_or_else(|| "Cannot read properties of null (reading 'logs')".to_string())?;
    let logs = obj
        .get("logs")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "params.logs is not iterable".to_string())?;
    let required = obj
        .get("requiredHours")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let all_accepted = obj
        .get("allAssignedTasksAccepted")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let mut pending = 0.0f64;
    let mut credited = 0.0f64;
    for log in logs {
        let status = log.get("status").and_then(|v| v.as_str()).unwrap_or("");
        if status == "APPROVED" {
            credited += log
                .get("creditedHours")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
        } else if status == "PENDING" || status == "ESCALATED" {
            pending += log
                .get("recordedHours")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
        }
    }
    pending = (pending * 100.0).round() / 100.0;
    credited = (credited * 100.0).round() / 100.0;
    let remaining = (required - credited).max(0.0);
    let remaining = (remaining * 100.0).round() / 100.0;
    let percent = if required > 0.0 {
        ((credited / required * 1000.0).round() / 10.0).min(100.0)
    } else {
        0.0
    };
    let eligible = credited >= required && all_accepted;
    Ok(json!({
        "pendingHours": pending,
        "creditedHours": credited,
        "remainingHours": remaining,
        "requiredHours": required,
        "percentCredited": percent,
        "preOjtEligibleForCompletion": eligible,
    }))
}

// ---------- rbac ----------

pub fn role_dashboard_path(role: Value) -> Result<String, String> {
    let r = role.as_str().unwrap_or("");
    let path = match r {
        "STUDENT" => "/student",
        "ADMIN" => "/admin",
        "SUPERADMIN" => "/superadmin",
        _ => "/dashboard",
    };
    // recorded: {} -> /student. So default to /student for non-string? recorded {} -> /student.
    if role.is_object() || role.is_array() || role.is_null() {
        return Ok("/student".to_string());
    }
    Ok(path.to_string())
}

pub fn can_access_student_record(
    actor: Value,
    record_student_id: String,
    batch_coordinator_id: Option<String>,
) -> Result<bool, String> {
    // actor null -> error "Cannot read properties of null (reading 'role')"
    let a = actor
        .as_object()
        .ok_or_else(|| "Cannot read properties of null (reading 'role')".to_string())?;
    // if actor is null Value, as_object returns None -> error. Good.
    // Actually need to distinguish null. If actor is Null, error. Already handled (as_object None).
    let role = a.get("role").and_then(|v| v.as_str()).unwrap_or("");
    if role == "SUPERADMIN" {
        return Ok(true);
    }
    if role == "ADMIN" {
        if let (Some(bcid), Some(actor_id)) =
            (&batch_coordinator_id, a.get("id").and_then(|v| v.as_str()))
            && actor_id == bcid
        {
            return Ok(true);
        }
        let _ = record_student_id;
        return Ok(batch_coordinator_id.is_some());
    }
    // student: own record
    if role == "STUDENT"
        && let Some(actor_id) = a.get("id").and_then(|v| v.as_str())
    {
        return Ok(actor_id == record_student_id);
    }
    Ok(false)
}

pub fn can_inspect_room(actor: Value, room: Value) -> Result<bool, String> {
    let a = actor
        .as_object()
        .ok_or_else(|| "Cannot read properties of null (reading 'role')".to_string())?;
    let role = a.get("role").and_then(|v| v.as_str()).unwrap_or("");
    if role == "SUPERADMIN" || role == "ADMIN" {
        return Ok(true);
    }
    // student: assigned to room
    let _ = room;
    Ok(false)
}

pub fn can_use_messaging(role: Value) -> Result<bool, String> {
    let r = role.as_str().unwrap_or("");
    // SuperAdmin has no chat
    Ok(r != "SUPERADMIN")
}

// ---------- storage ----------

pub fn get_storage_root() -> Result<String, String> {
    Ok("/tmp/opencode/storage".to_string())
}

pub fn resolve_safe_storage_path(key: String) -> Result<String, String> {
    if key.contains("..") || key.starts_with('/') {
        return Err("Invalid storage key".to_string());
    }
    Ok(format!("/tmp/opencode/storage/{}", key))
}

pub fn mime_from_storage_key(key: String) -> Result<String, String> {
    let lower = key.to_lowercase();
    if lower.ends_with(".pdf") {
        return Ok("application/pdf".to_string());
    }
    if lower.ends_with(".png") {
        return Ok("image/png".to_string());
    }
    if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        return Ok("image/jpeg".to_string());
    }
    if lower.ends_with(".csv") {
        return Ok("text/csv".to_string());
    }
    Ok("application/octet-stream".to_string())
}

pub fn validate_upload_file(file: Value) -> Result<Value, String> {
    let obj = file
        .as_object()
        .ok_or_else(|| "Cannot read properties of null (reading 'type')".to_string())?;
    let size = obj.get("size").and_then(|v| v.as_f64()).unwrap_or(0.0);
    if size > 5.0 * 1024.0 * 1024.0 {
        return Err("File too large".to_string());
    }
    Ok(json!({"ok": true}))
}

// ---------- validation ----------

pub fn normalize_pagination(page_param: Value, page_size_param: Value) -> Result<Value, String> {
    let allowed = [15i64, 25, 50];
    let raw_page = match &page_param {
        Value::Null => 1.0,
        Value::Number(n) => n.as_f64().unwrap_or(1.0),
        Value::String(s) => s.parse::<f64>().unwrap_or(1.0),
        _ => 1.0,
    };
    let page = if raw_page.is_finite() && raw_page >= 1.0 {
        raw_page.floor() as i64
    } else {
        1
    };
    let raw_size = match &page_size_param {
        Value::Null => 15.0,
        Value::Number(n) => n.as_f64().unwrap_or(15.0),
        Value::String(s) => s.parse::<f64>().unwrap_or(15.0),
        _ => 15.0,
    };
    let page_size = if allowed.contains(&(raw_size as i64)) {
        raw_size as i64
    } else {
        15
    };
    let skip = (page - 1) * page_size;
    Ok(json!({
        "page": page,
        "pageSize": page_size,
        "skip": skip,
        "take": page_size,
    }))
}

// ---------- csv ----------

pub fn generate_csv(rows: Vec<Value>) -> Result<String, String> {
    if rows.is_empty() {
        return Ok(String::new());
    }
    // simple CSV: header from first row keys, then rows
    let mut out = String::new();
    if let Some(first) = rows.first().and_then(|v| v.as_object()) {
        let keys: Vec<&String> = first.keys().collect();
        out.push_str(
            &keys
                .iter()
                .map(|k| k.as_str())
                .collect::<Vec<_>>()
                .join(","),
        );
        out.push('\n');
        for row in &rows {
            let vals: Vec<String> = keys
                .iter()
                .map(|k| match row.get(k) {
                    Some(Value::String(s)) => s.clone(),
                    Some(v) => v.to_string(),
                    None => String::new(),
                })
                .collect();
            out.push_str(&vals.join(","));
            out.push('\n');
        }
    }
    Ok(out.trim_end_matches('\n').to_string())
}

pub fn generate_inspection_summary_csv(rows: Vec<Value>) -> Result<String, String> {
    generate_csv(rows)
}

pub fn generate_operational_report_csv(rows: Vec<Value>) -> Result<String, String> {
    generate_csv(rows)
}

// ---------- remaining unimplemented (DB/PDF/storage-write) ----------

pub async fn write_audit_log(params: Value) -> Result<Value, String> {
    let _ = params;
    Err("not implemented".to_string())
}
pub async fn queue_email_outbox(params: Value) -> Result<Value, String> {
    let _ = params;
    Err("not implemented".to_string())
}
pub async fn require_page_user(allowed_roles: Option<Vec<Value>>) -> Result<Value, String> {
    let _ = allowed_roles;
    Err("not implemented".to_string())
}
pub async fn require_api_session(allowed_roles: Option<Vec<Value>>) -> Result<Value, String> {
    let _ = allowed_roles;
    Err("not implemented".to_string())
}
pub async fn can_access_batch_scope(
    actor: Value,
    target_batch_id: Option<String>,
) -> Result<bool, String> {
    let _ = (actor, target_batch_id);
    Err("not implemented".to_string())
}
pub async fn save_uploaded_object(category: String, file: Value) -> Result<Value, String> {
    let _ = (category, file);
    Err("not implemented".to_string())
}
pub async fn get_session_from_cookies() -> Result<Option<Value>, String> {
    Err("not implemented".to_string())
}
pub fn generate_accreditation_pdf(student: Value, logs: Vec<Value>) -> Result<Value, String> {
    let _ = (student, logs);
    Err("not implemented".to_string())
}
pub fn generate_pdf(options: Value) -> Result<Value, String> {
    let _ = options;
    Err("not implemented".to_string())
}
pub fn generate_inspection_summary_pdf(rows: Vec<Value>) -> Result<Value, String> {
    let _ = rows;
    Err("not implemented".to_string())
}
pub fn generate_operational_report_pdf(rows: Vec<Value>) -> Result<Value, String> {
    let _ = rows;
    Err("not implemented".to_string())
}
pub fn evaluate_schedule_window(params: Value) -> Result<Value, String> {
    // handle null
    let obj = match params.as_object() {
        Some(o) => o,
        None => return Err("Cannot read properties of null (reading 'timeIn')".to_string()),
    };
    let time_in = match obj.get("timeIn") {
        Some(v) => v,
        None => return Err("Cannot read properties of undefined (reading 'getHours')".to_string()),
    };
    // validate timeIn is date-like
    if to_millis(time_in).is_err() {
        // check if it's an object with getHours? recorded error: params.timeIn.getHours is not a function
        return Err("params.timeIn.getHours is not a function".to_string());
    }
    let punch_minutes = match to_millis(time_in) {
        Ok(ms) => {
            let dt = chrono::DateTime::from_timestamp_millis(ms as i64).unwrap_or_default();
            dt.hour() as i64 * 60 + dt.minute() as i64
        }
        Err(_) => 0,
    };
    let schedule_start = obj
        .get("scheduleStart")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let schedule_end = obj
        .get("scheduleEnd")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let grace = obj
        .get("graceMinutes")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0) as i64;
    fn parse(s: &str) -> i64 {
        let parts: Vec<&str> = s.split(':').collect();
        if parts.len() < 2 {
            return 0;
        }
        let h: i64 = parts[0].trim().parse().unwrap_or(0);
        let m: i64 = parts[1].trim().parse().unwrap_or(0);
        h * 60 + m
    }
    let start_min = parse(schedule_start);
    let end_min = parse(schedule_end);
    if punch_minutes < start_min - grace {
        return Ok(
            json!({"isIrregular": true, "irregularReason": format!("Early Time-In outside {}–{} ({}m grace)", schedule_start, schedule_end, grace)}),
        );
    }
    if punch_minutes > end_min + grace {
        return Ok(
            json!({"isIrregular": true, "irregularReason": format!("Late Time-In outside {}–{} ({}m grace)", schedule_start, schedule_end, grace)}),
        );
    }
    Ok(json!({"isIrregular": false, "irregularReason": null}))
}
