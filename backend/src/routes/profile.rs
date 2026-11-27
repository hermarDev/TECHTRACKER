use crate::audit::write_audit_log;
use crate::auth::{hash_password, verify_password};
use crate::error::{AppError, Result};
use crate::middleware::AuthUser;
use crate::state::AppState;
use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use chrono::Utc;
use serde::Deserialize;
use serde_json::json;
use sqlx::Row;

#[derive(Deserialize)]
struct ProfileUpdateInput {
    #[serde(rename = "fullName")]
    full_name: Option<String>,
    phone: Option<String>,
    program: Option<String>,
    section: Option<String>,
}

#[derive(Deserialize)]
struct ChangePasswordInput {
    #[serde(rename = "currentPassword")]
    current_password: String,
    #[serde(rename = "newPassword")]
    new_password: String,
    #[serde(rename = "confirmPassword")]
    confirm_password: String,
}

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/api/profile",
        get(get_profile).put(update_profile).patch(change_password),
    )
}

async fn get_profile(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<serde_json::Value>> {
    let row = sqlx::query("SELECT id,email,\"fullName\",role::text,status::text,\"studentIdNo\",program,section,phone,\"batchId\",\"requiredHours\",\"createdAt\"::timestamptz FROM \"User\" WHERE id=$1")
        .bind(&auth.0.sub).fetch_optional(&state.db).await?
        .ok_or(AppError::NotFound)?;
    let user = json!({
        "id": row.try_get::<String,_>("id").unwrap_or_default(),
        "email": row.try_get::<String,_>("email").unwrap_or_default(),
        "fullName": row.try_get::<String,_>("fullName").unwrap_or_default(),
        "role": row.try_get::<String,_>("role").unwrap_or_default(),
        "status": row.try_get::<String,_>("status").unwrap_or_default(),
        "studentIdNo": row.try_get::<Option<String>,_>("studentIdNo").unwrap_or(None),
        "program": row.try_get::<Option<String>,_>("program").unwrap_or(None),
        "section": row.try_get::<Option<String>,_>("section").unwrap_or(None),
        "phone": row.try_get::<Option<String>,_>("phone").unwrap_or(None),
        "batchId": row.try_get::<Option<String>,_>("batchId").unwrap_or(None),
        "requiredHours": row.try_get::<f64,_>("requiredHours").unwrap_or(100.0),
        "createdAt": row.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
    });
    Ok(Json(json!({"user": user})))
}

async fn update_profile(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>> {
    let input: ProfileUpdateInput = serde_json::from_value(body)
        .map_err(|_| AppError::BadRequest("Invalid profile details".into()))?;

    // validation
    if let Some(ref name) = input.full_name {
        if name.trim().len() < 2 || name.trim().len() > 120 {
            return Err(AppError::BadRequest("Full name is required".into()));
        }
    }
    if let Some(ref phone) = input.phone {
        // phone can be null after transform; here empty string -> null handled below
        if phone.len() > 32 {
            return Err(AppError::BadRequest("Phone number is too long".into()));
        }
        let re_ok = phone
            .chars()
            .all(|c| c.is_ascii_digit() || "+()- ".contains(c));
        if !re_ok {
            return Err(AppError::BadRequest(
                "Phone may only contain digits, spaces and + ( ) -".into(),
            ));
        }
    }
    if let Some(ref p) = input.program {
        if p.trim().len() < 2 || p.trim().len() > 40 {
            return Err(AppError::BadRequest("Program is required".into()));
        }
    }
    if let Some(ref s) = input.section {
        if s.trim().is_empty() || s.trim().len() > 40 {
            return Err(AppError::BadRequest("Section is required".into()));
        }
    }

    // Update only provided fields (TS sends undefined for absent keys).
    if let Some(v) = &input.full_name {
        sqlx::query("UPDATE \"User\" SET \"fullName\"=$1, \"updatedAt\"=NOW() WHERE id=$2")
            .bind(v.trim())
            .bind(&auth.0.sub)
            .execute(&state.db)
            .await?;
    }
    if let Some(v) = &input.phone {
        let pv: Option<&str> = if v.trim().is_empty() {
            None
        } else {
            Some(v.trim())
        };
        sqlx::query("UPDATE \"User\" SET phone=$1, \"updatedAt\"=NOW() WHERE id=$2")
            .bind(pv)
            .bind(&auth.0.sub)
            .execute(&state.db)
            .await?;
    }
    if let Some(v) = &input.program {
        sqlx::query("UPDATE \"User\" SET program=$1, \"updatedAt\"=NOW() WHERE id=$2")
            .bind(v.trim())
            .bind(&auth.0.sub)
            .execute(&state.db)
            .await?;
    }
    if let Some(v) = &input.section {
        sqlx::query("UPDATE \"User\" SET section=$1, \"updatedAt\"=NOW() WHERE id=$2")
            .bind(v.trim())
            .bind(&auth.0.sub)
            .execute(&state.db)
            .await?;
    }

    let row =
        sqlx::query("SELECT id,email,\"fullName\",phone,program,section FROM \"User\" WHERE id=$1")
            .bind(&auth.0.sub)
            .fetch_one(&state.db)
            .await?;
    let user = json!({
        "id": row.try_get::<String,_>("id").unwrap_or_default(),
        "email": row.try_get::<String,_>("email").unwrap_or_default(),
        "fullName": row.try_get::<String,_>("fullName").unwrap_or_default(),
        "phone": row.try_get::<Option<String>,_>("phone").unwrap_or(None),
        "program": row.try_get::<Option<String>,_>("program").unwrap_or(None),
        "section": row.try_get::<Option<String>,_>("section").unwrap_or(None),
    });
    write_audit_log(
        &state,
        Some(&auth.0.sub),
        "PROFILE_UPDATED",
        "User",
        &auth.0.sub,
        json!({"fullName": user.get("fullName"), "phone": user.get("phone")}),
    )
    .await
    .ok();
    Ok(Json(
        json!({"user": user, "message": "Profile updated successfully."}),
    ))
}

async fn change_password(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>> {
    let input: ChangePasswordInput = serde_json::from_value(body)
        .map_err(|_| AppError::BadRequest("Invalid password change details".into()))?;
    if input.current_password.is_empty() {
        return Err(AppError::BadRequest("Current password is required".into()));
    }
    if input.new_password.len() < 8 || input.new_password.len() > 128 {
        return Err(AppError::BadRequest(
            "New password must be at least 8 characters".into(),
        ));
    }
    if input.new_password != input.confirm_password {
        return Err(AppError::BadRequest("New passwords do not match".into()));
    }
    if input.new_password == input.current_password {
        return Err(AppError::BadRequest(
            "New password must differ from current password".into(),
        ));
    }

    let row = sqlx::query("SELECT \"passwordHash\" FROM \"User\" WHERE id=$1")
        .bind(&auth.0.sub)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound)?;
    let hash: String = row.try_get("passwordHash")?;
    if !verify_password(&input.current_password, &hash) {
        return Err(AppError::BadRequest(
            "Current password is incorrect.".into(),
        ));
    }
    let new_hash = hash_password(&input.new_password)?;
    sqlx::query("UPDATE \"User\" SET \"passwordHash\"=$1, \"tokenVersion\"=\"tokenVersion\"+1, \"updatedAt\"=NOW() WHERE id=$2")
        .bind(&new_hash)
        .bind(&auth.0.sub)
        .execute(&state.db)
        .await?;
    write_audit_log(
        &state,
        Some(&auth.0.sub),
        "AUTH_PASSWORD_CHANGED",
        "User",
        &auth.0.sub,
        json!({"email": auth.0.email, "via": "PROFILE"}),
    )
    .await
    .ok();
    Ok(Json(json!({"message": "Password changed successfully."})))
}
