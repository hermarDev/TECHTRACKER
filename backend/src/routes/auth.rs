use crate::audit::{queue_email_outbox, write_audit_log};
use crate::auth::{
    create_opaque_token, hash_password, hash_token, next_failure, sign_session_jwt,
    verify_password, SessionPayload, SESSION_MAX_AGE_SECONDS,
};
use crate::error::{AppError, Result};
use crate::middleware::AuthUser;
use crate::state::AppState;
use crate::validation::{ForgotPasswordInput, LoginInput, RegisterInput};
use axum::extract::{Query, State};
use axum::http::header::SET_COOKIE;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::Utc;
use serde::Deserialize;
use serde_json::json;
use sqlx::Row;
use uuid::Uuid;
use validator::Validate;

fn cookie_str(token: &str, max_age: i64, secure: bool) -> String {
    format!(
        "techtracker_session={}; HttpOnly; Path=/; SameSite=Lax; Max-Age={}{}",
        token,
        max_age,
        if secure { "; Secure" } else { "" }
    )
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/auth/register", post(register))
        .route("/api/auth/verify", get(verify_get).post(verify_post))
        .route("/api/auth/login", post(login))
        .route("/api/auth/logout", post(logout))
        .route("/api/auth/forgot-password", post(forgot_password))
        .route("/api/auth/reset-password", post(reset_password))
        .route("/api/auth/me", get(me))
}

#[derive(Deserialize)]
struct VerifyQuery {
    token: Option<String>,
}

async fn register(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Result<Response> {
    let input: RegisterInput = serde_json::from_value(body.clone())
        .map_err(|_| AppError::BadRequest("Invalid registration details".into()))?;
    input
        .validate()
        .map_err(|e| AppError::BadRequest(e.to_string()))?;

    // system config
    let allow =
        sqlx::query("SELECT \"allowSelfRegistration\" FROM \"SystemConfig\" WHERE id='singleton'")
            .fetch_optional(&state.db)
            .await?;
    if let Some(row) = allow {
        let a: bool = row.try_get("allowSelfRegistration").unwrap_or(true);
        if !a {
            return Err(AppError::Forbidden);
        }
    }

    let email = input.email.to_lowercase();
    let existing = sqlx::query("SELECT id FROM \"User\" WHERE email=$1")
        .bind(&email)
        .fetch_optional(&state.db)
        .await?;
    if existing.is_some() {
        return Err(AppError::Conflict(
            "An account with this email address already exists.".into(),
        ));
    }

    let sid = sqlx::query("SELECT id FROM \"User\" WHERE \"studentIdNo\"=$1")
        .bind(&input.student_id_no)
        .fetch_optional(&state.db)
        .await?;
    if sid.is_some() {
        return Err(AppError::Conflict(
            "This student ID number is already registered.".into(),
        ));
    }

    let (raw_tok, hash_tok) = create_opaque_token();
    let pw_hash = hash_password(&input.password)?;
    let user_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO \"User\" (id, email, \"passwordHash\", \"fullName\", role, status, \"studentIdNo\", program, section, \"verificationToken\", \"verificationSentAt\", \"createdAt\", \"updatedAt\", \"requiredHours\", \"preOjtCompleted\", \"failedLoginCount\") VALUES ($1,$2,$3,$4,'STUDENT','PENDING_VERIFICATION',$5,$6,$7,$8,NOW(),NOW(),NOW(),100,false,0)"
    )
    .bind(&user_id).bind(&email).bind(&pw_hash).bind(&input.full_name)
    .bind(&input.student_id_no).bind(&input.program).bind(&input.section).bind(&hash_tok)
    .execute(&state.db).await?;

    let verify_url = format!(
        "{}/api/auth/verify?token={}",
        state.config.app_url.trim_end_matches('/'),
        raw_tok
    );
    queue_email_outbox(
        &state,
        &email,
        "TechTracker — Verify Your Student Account",
        "VERIFICATION",
        &format!("Hello {},\n\nVerify: {}\n", input.full_name, verify_url),
    )
    .await?;

    write_audit_log(
        &state,
        Some(&user_id),
        "AUTH_REGISTER",
        "User",
        &user_id,
        json!({"email": email, "studentIdNo": input.student_id_no}),
    )
    .await?;

    let resp = json!({
        "user": {"id": user_id, "email": email, "fullName": input.full_name, "role": "STUDENT", "status": "PENDING_VERIFICATION"},
        "message": "Registration received. Check your email for the verification link."
    });
    Ok((StatusCode::CREATED, Json(resp)).into_response())
}

async fn verify_get(State(state): State<AppState>, Query(q): Query<VerifyQuery>) -> Response {
    let token = match q.token {
        Some(t) if !t.is_empty() => t,
        _ => {
            return Redirect::to(&format!(
                "{}/login?verified=invalid",
                state.config.app_url.trim_end_matches('/')
            ))
            .into_response();
        }
    };
    if consume_token(&state, &token).await.is_err() {
        return Redirect::to(&format!(
            "{}/login?verified=invalid",
            state.config.app_url.trim_end_matches('/')
        ))
        .into_response();
    }
    Redirect::to(&format!(
        "{}/login?verified=1",
        state.config.app_url.trim_end_matches('/')
    ))
    .into_response()
}

async fn verify_post(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Result<Response> {
    let token = body
        .get("token")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| s.len() >= 10)
        .ok_or_else(|| AppError::BadRequest("Invalid or expired verification token.".into()))?;
    let user_id = consume_token(&state, &token).await?;
    // fetch user
    let row = sqlx::query("SELECT id,email FROM \"User\" WHERE id=$1")
        .bind(&user_id)
        .fetch_one(&state.db)
        .await?;
    let email: String = row.try_get("email")?;
    let resp = json!({"message": "Email verified. Your account is now active — you can sign in.", "user": {"id": user_id, "email": email, "status": "ACTIVE"}});
    Ok(Json(resp).into_response())
}

async fn consume_token(state: &AppState, raw: &str) -> Result<String> {
    let hashed = hash_token(raw);
    // Atomic claim: only the first request can flip PENDING -> ACTIVE.
    let row = sqlx::query(
        "UPDATE \"User\" SET status='ACTIVE', \"verificationToken\"=NULL, \"updatedAt\"=NOW() \
         WHERE \"verificationToken\"=$1 AND status='PENDING_VERIFICATION' \
           AND \"verificationSentAt\" > NOW() - INTERVAL '24 hours' \
         RETURNING id",
    )
    .bind(&hashed)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::BadRequest("Invalid or expired verification token.".into()))?;
    let id: String = row.try_get("id")?;
    write_audit_log(
        state,
        Some(&id),
        "AUTH_EMAIL_VERIFIED",
        "User",
        &id,
        json!({"email": ""}),
    )
    .await
    .ok();
    Ok(id)
}

async fn login(State(state): State<AppState>, Json(body): Json<serde_json::Value>) -> Response {
    let input: LoginInput = match serde_json::from_value(body) {
        Ok(v) => v,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Invalid sign-in details"})),
            )
                .into_response()
        }
    };
    if input.validate().is_err() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Invalid sign-in details"})),
        )
            .into_response();
    }
    let email = input.email.to_lowercase();

    let row = match sqlx::query("SELECT id,email,\"passwordHash\",\"fullName\",role::text,status::text,\"batchId\",\"failedLoginCount\",\"lockedUntil\"::timestamptz FROM \"User\" WHERE email=$1")
        .bind(&email).fetch_optional(&state.db).await {
        Ok(r) => r,
        Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))).into_response(),
    };
    let row = match row {
        Some(r) => r,
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({"error": "Invalid email or password."})),
            )
                .into_response()
        }
    };

    let user_id: String = row.try_get("id").unwrap_or_default();
    let pw_hash: String = row.try_get("passwordHash").unwrap_or_default();
    let full_name: String = row.try_get("fullName").unwrap_or_default();
    let role: String = row.try_get("role").unwrap_or_default();
    let status: String = row.try_get("status").unwrap_or_default();
    let batch_id: Option<String> = row.try_get("batchId").ok();
    let failed: i32 = row.try_get("failedLoginCount").unwrap_or(0);
    let locked_until: Option<chrono::DateTime<Utc>> = row.try_get("lockedUntil").ok();

    let (is_locked, mins) = crate::auth::evaluate_lockout(failed, locked_until, Utc::now());
    if is_locked {
        return (StatusCode::LOCKED, Json(json!({"error": format!("Account is locked due to too many failed sign-in attempts. Try again in {} minute(s).", mins), "remainingMinutes": mins}))).into_response();
    }

    if !verify_password(&input.password, &pw_hash) {
        let (nfc, nlu, triggered, remaining) = next_failure(failed, Utc::now());
        let _ = sqlx::query(
            "UPDATE \"User\" SET \"failedLoginCount\"=$1, \"lockedUntil\"=$2 WHERE id=$3",
        )
        .bind(nfc)
        .bind(nlu)
        .bind(&user_id)
        .execute(&state.db)
        .await;
        if triggered {
            let _ = queue_email_outbox(
                &state,
                &email,
                "TechTracker Security Alert — Account Locked",
                "SECURITY_ALERT",
                &format!("Security alert for {} ({}).", full_name, email),
            )
            .await;
            let _ = write_audit_log(
                &state,
                Some(&user_id),
                "AUTH_LOCKOUT_TRIGGERED",
                "User",
                &user_id,
                json!({"email": email, "failedLoginCount": nfc}),
            )
            .await;
            return (StatusCode::LOCKED, Json(json!({"error": "Account is locked due to 5 consecutive failed sign-in attempts. A security alert has been logged. Try again in 15 minutes.", "remainingMinutes": 15}))).into_response();
        }
        return (StatusCode::UNAUTHORIZED, Json(json!({"error": format!("Invalid email or password. {} attempt(s) remaining before a 15-minute lockout.", remaining), "remainingAttempts": remaining}))).into_response();
    }

    if status == "PENDING_VERIFICATION" {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "Verify your email address first. Check your inbox (or the local dev outbox at /dev/outbox) for the verification link."}))).into_response();
    }
    if status != "ACTIVE" {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "This account is suspended or deactivated. Contact your Pre-OJT coordinator."}))).into_response();
    }

    let _ =
        sqlx::query("UPDATE \"User\" SET \"failedLoginCount\"=0, \"lockedUntil\"=NULL WHERE id=$1")
            .bind(&user_id)
            .execute(&state.db)
            .await;

    let token = match sign_session_jwt(
        &state.config,
        &SessionPayload {
            sub: user_id.clone(),
            email: email.clone(),
            full_name: full_name.clone(),
            role: role.clone(),
            batch_id: batch_id.clone(),
        },
    ) {
        Ok(t) => t,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
                .into_response()
        }
    };

    let _ = write_audit_log(
        &state,
        Some(&user_id),
        "AUTH_LOGIN",
        "User",
        &user_id,
        json!({"email": email, "role": role}),
    )
    .await;

    let resp = json!({
        "user": {"id": user_id, "email": email, "fullName": full_name, "role": role, "status": status, "batchId": batch_id},
        "message": "Signed in successfully."
    });

    let secure = state.config.is_prod();
    let cookie = cookie_str(&token, SESSION_MAX_AGE_SECONDS, secure);
    let mut response = (StatusCode::OK, Json(resp)).into_response();
    response
        .headers_mut()
        .insert(SET_COOKIE, cookie.parse().unwrap());
    response
}

async fn logout() -> Response {
    let cookie = "techtracker_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT".to_string();
    let mut response = (
        StatusCode::OK,
        Json(json!({"message": "Signed out successfully."})),
    )
        .into_response();
    response
        .headers_mut()
        .insert(SET_COOKIE, cookie.parse().unwrap());
    response
}

async fn forgot_password(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Result<Response> {
    let input: ForgotPasswordInput = serde_json::from_value(body)
        .map_err(|_| AppError::BadRequest("Enter a valid email address".into()))?;
    input
        .validate()
        .map_err(|e| AppError::BadRequest(e.to_string()))?;
    let email = input.email.to_lowercase();

    let generic = "If an account exists for this email address, a password reset link has been sent. The link expires in 1 hour.";

    let row = sqlx::query("SELECT id, \"fullName\" FROM \"User\" WHERE email=$1")
        .bind(&email)
        .fetch_optional(&state.db)
        .await?;
    if let Some(r) = row {
        let user_id: String = r.try_get("id")?;
        let full_name: String = r.try_get("fullName")?;
        sqlx::query(
            "DELETE FROM \"PasswordResetToken\" WHERE \"userId\"=$1 AND \"usedAt\" IS NULL",
        )
        .bind(&user_id)
        .execute(&state.db)
        .await?;
        let (raw, hash) = create_opaque_token();
        let expires = Utc::now() + chrono::Duration::hours(1);
        sqlx::query("INSERT INTO \"PasswordResetToken\" (id, \"userId\", \"tokenHash\", \"expiresAt\", \"createdAt\") VALUES ($1,$2,$3,$4,NOW())")
            .bind(Uuid::new_v4().to_string()).bind(&user_id).bind(&hash).bind(expires).execute(&state.db).await?;
        let reset_url = format!(
            "{}/reset-password?token={}",
            state.config.app_url.trim_end_matches('/'),
            raw
        );
        queue_email_outbox(
            &state,
            &email,
            "TechTracker — Reset Your Password",
            "PASSWORD_RESET",
            &format!("Hello {},\n\nReset: {}\n", full_name, reset_url),
        )
        .await?;
    }

    Ok(Json(json!({"message": generic})).into_response())
}

async fn reset_password(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Result<Response> {
    #[derive(Deserialize)]
    struct B {
        token: String,
        password: String,
        #[serde(rename = "confirmPassword")]
        confirm_password: String,
    }
    let b: B = serde_json::from_value(body)
        .map_err(|_| AppError::BadRequest("Invalid reset details".into()))?;
    if b.password.len() < 8 {
        return Err(AppError::BadRequest(
            "Password must be at least 8 characters".into(),
        ));
    }
    if b.password != b.confirm_password {
        return Err(AppError::BadRequest("Passwords do not match".into()));
    }
    if b.token.trim().len() < 16 {
        return Err(AppError::BadRequest(
            "Invalid or expired reset token".into(),
        ));
    }

    let hashed = hash_token(b.token.trim());
    let row = sqlx::query("SELECT id, \"userId\", \"expiresAt\"::timestamptz, \"usedAt\"::timestamptz FROM \"PasswordResetToken\" WHERE \"tokenHash\"=$1")
        .bind(&hashed).fetch_optional(&state.db).await?
        .ok_or_else(|| AppError::BadRequest("Invalid or expired reset token. Request a new password reset link.".into()))?;
    let rec_id: String = row.try_get("id")?;
    let user_id: String = row.try_get("userId")?;
    let expires: chrono::DateTime<Utc> = row.try_get("expiresAt")?;
    let used: Option<chrono::DateTime<Utc>> = row.try_get("usedAt").ok();
    if used.is_some() || expires <= Utc::now() {
        return Err(AppError::BadRequest(
            "Invalid or expired reset token. Request a new password reset link.".into(),
        ));
    }

    // Atomic claim: the token can only be consumed once.
    let claim = sqlx::query(
        "UPDATE \"PasswordResetToken\" SET \"usedAt\"=NOW() WHERE id=$1 AND \"usedAt\" IS NULL",
    )
    .bind(&rec_id)
    .execute(&state.db)
    .await?;
    if claim.rows_affected() == 0 {
        return Err(AppError::BadRequest(
            "Invalid or expired reset token. Request a new password reset link.".into(),
        ));
    }

    let pw_hash = hash_password(&b.password)?;
    sqlx::query("UPDATE \"User\" SET \"passwordHash\"=$1, \"failedLoginCount\"=0, \"lockedUntil\"=NULL, \"updatedAt\"=NOW() WHERE id=$2")
        .bind(&pw_hash).bind(&user_id).execute(&state.db).await?;

    write_audit_log(
        &state,
        Some(&user_id),
        "AUTH_PASSWORD_RESET",
        "User",
        &user_id,
        json!({"via": "RESET_TOKEN"}),
    )
    .await
    .ok();
    Ok(Json(json!({"message": "Password updated successfully. You can now sign in with your new password."})).into_response())
}

async fn me(State(state): State<AppState>, auth: AuthUser) -> Result<Response> {
    let row = sqlx::query("SELECT \"preOjtCompleted\" FROM \"User\" WHERE id=$1")
        .bind(&auth.0.sub)
        .fetch_optional(&state.db)
        .await?;
    let pre = row
        .and_then(|r| r.try_get::<bool, _>("preOjtCompleted").ok())
        .unwrap_or(false);
    let resp = json!({
        "user": {
            "id": auth.0.sub,
            "email": auth.0.email,
            "fullName": auth.0.full_name,
            "role": auth.0.role,
            "status": "ACTIVE",
            "batchId": auth.0.batch_id,
            "preOjtCompleted": pre,
        }
    });
    Ok(Json(resp).into_response())
}
