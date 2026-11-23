use crate::audit::write_audit_log;
use crate::error::{AppError, Result};
use crate::middleware::AuthUser;
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use chrono::Utc;
use serde::Deserialize;
use serde_json::json;
use sqlx::Row;
use uuid::Uuid;

fn can_msg(role: &str) -> bool {
    role == "STUDENT" || role == "ADMIN"
}

#[derive(Deserialize, Default)]
struct MsgSendInput {
    #[serde(rename = "conversationId")]
    conversation_id: Option<String>,
    #[serde(rename = "type")]
    conv_type: Option<String>,
    #[serde(rename = "recipientIds")]
    recipient_ids: Option<Vec<String>>,
    #[serde(rename = "batchId")]
    batch_id: Option<String>,
    body: String,
    #[serde(rename = "attachmentKey")]
    attachment_key: Option<String>,
    #[serde(rename = "attachmentName")]
    attachment_name: Option<String>,
    #[serde(rename = "attachmentMime")]
    attachment_mime: Option<String>,
    #[serde(rename = "attachmentSize")]
    attachment_size: Option<i64>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/messages", get(list).post(create_or_send))
        .route("/api/messages/:conversation_id", post(send_to_conv))
}

async fn list(State(state): State<AppState>, auth: AuthUser) -> Result<Json<serde_json::Value>> {
    if !can_msg(&auth.0.role) {
        return Err(AppError::Forbidden);
    }
    // conversations where user is member
    let convs = sqlx::query("SELECT id,type::text,\"batchId\",\"createdAt\"::timestamptz,\"updatedAt\"::timestamptz FROM \"Conversation\" WHERE id IN (SELECT \"conversationId\" FROM \"ConversationMember\" WHERE \"userId\"=$1) ORDER BY \"updatedAt\"::timestamptz DESC")
        .bind(&auth.0.sub).fetch_all(&state.db).await?;
    let mut out = Vec::new();
    for c in convs {
        let cid: String = c.try_get("id")?;
        let members = sqlx::query("SELECT cm.\"userId\", u.\"fullName\",u.email,u.role::text FROM \"ConversationMember\" cm JOIN \"User\" u ON cm.\"userId\"=u.id WHERE cm.\"conversationId\"=$1")
            .bind(&cid).fetch_all(&state.db).await.unwrap_or_default();
        let members_json: Vec<serde_json::Value> = members
            .into_iter()
            .map(|m| {
                json!({
                    "userId": m.try_get::<String,_>("userId").unwrap_or_default(),
                    "user": {
                        "id": m.try_get::<String,_>("userId").unwrap_or_default(),
                        "fullName": m.try_get::<String,_>("fullName").unwrap_or_default(),
                        "email": m.try_get::<String,_>("email").unwrap_or_default(),
                        "role": m.try_get::<String,_>("role").unwrap_or_default(),
                    }
                })
            })
            .collect();
        let msgs = sqlx::query("SELECT id,\"conversationId\",\"senderId\",body,\"attachmentKey\",\"attachmentName\",\"attachmentMime\",\"attachmentSize\",\"createdAt\"::timestamptz FROM \"Message\" WHERE \"conversationId\"=$1 ORDER BY \"createdAt\"::timestamptz DESC LIMIT 5")
            .bind(&cid).fetch_all(&state.db).await.unwrap_or_default();
        let msgs_json: Vec<serde_json::Value> = msgs.into_iter().map(|m| json!({
            "id": m.try_get::<String,_>("id").unwrap_or_default(),
            "conversationId": m.try_get::<String,_>("conversationId").unwrap_or_default(),
            "senderId": m.try_get::<String,_>("senderId").unwrap_or_default(),
            "body": m.try_get::<String,_>("body").unwrap_or_default(),
            "attachmentKey": m.try_get::<Option<String>,_>("attachmentKey").unwrap_or(None),
            "attachmentName": m.try_get::<Option<String>,_>("attachmentName").unwrap_or(None),
            "attachmentMime": m.try_get::<Option<String>,_>("attachmentMime").unwrap_or(None),
            "attachmentSize": m.try_get::<Option<i32>,_>("attachmentSize").unwrap_or(None),
            "createdAt": m.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
        })).collect();
        // batch info
        let batch_id: Option<String> = c.try_get("batchId").ok();
        let batch_json = if let Some(bid) = &batch_id {
            let b = sqlx::query("SELECT id,name,section FROM \"Batch\" WHERE id=$1")
                .bind(bid)
                .fetch_optional(&state.db)
                .await
                .ok()
                .flatten();
            b.map(|r| json!({"id": r.try_get::<String,_>("id").unwrap_or_default(), "name": r.try_get::<String,_>("name").unwrap_or_default(), "section": r.try_get::<String,_>("section").unwrap_or_default()}))
        } else {
            None
        };
        out.push(json!({
            "id": cid,
            "type": c.try_get::<String,_>("type").unwrap_or_default(),
            "batchId": batch_id,
            "createdAt": c.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
            "updatedAt": c.try_get::<chrono::DateTime<Utc>,_>("updatedAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
            "members": members_json,
            "messages": msgs_json,
            "batch": batch_json,
        }));
    }
    Ok(Json(json!({"conversations": out})))
}

async fn create_or_send(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>> {
    if !can_msg(&auth.0.role) {
        return Err(AppError::Forbidden);
    }
    let input: MsgSendInput =
        serde_json::from_value(body).map_err(|_| AppError::BadRequest("Invalid input".into()))?;
    if input.body.trim().is_empty() {
        return Err(AppError::BadRequest("Message body is required".into()));
    }

    // existing conversation
    if let Some(cid) = &input.conversation_id {
        let conv = sqlx::query("SELECT id FROM \"Conversation\" WHERE id=$1")
            .bind(cid)
            .fetch_optional(&state.db)
            .await?
            .ok_or_else(|| AppError::NotFound)?;
        let _ = conv;
        // membership check
        let is_member: i64 = sqlx::query("SELECT COUNT(*) as c FROM \"ConversationMember\" WHERE \"conversationId\"=$1 AND \"userId\"=$2")
            .bind(cid).bind(&auth.0.sub).fetch_one(&state.db).await?.try_get("c").unwrap_or(0);
        if is_member == 0 {
            return Err(AppError::Forbidden);
        }
        // create message
        let mid = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO \"Message\" (id,\"conversationId\",\"senderId\",body,\"attachmentKey\",\"attachmentName\",\"attachmentMime\",\"attachmentSize\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())")
            .bind(&mid).bind(cid).bind(&auth.0.sub).bind(input.body.trim())
            .bind(input.attachment_key.as_deref()).bind(input.attachment_name.as_deref())
            .bind(input.attachment_mime.as_deref()).bind(input.attachment_size.map(|x| x as i32))
            .execute(&state.db).await?;
        sqlx::query("UPDATE \"Conversation\" SET \"updatedAt\"=NOW() WHERE id=$1")
            .bind(cid)
            .execute(&state.db)
            .await?;
        write_audit_log(
            &state,
            Some(&auth.0.sub),
            "MESSAGE_SENT",
            "Message",
            &mid,
            json!({"conversationId": cid}),
        )
        .await
        .ok();
        let msg = sqlx::query("SELECT id,\"conversationId\",\"senderId\",body,\"attachmentKey\",\"attachmentName\",\"attachmentMime\",\"attachmentSize\",\"createdAt\"::timestamptz FROM \"Message\" WHERE id=$1")
            .bind(&mid).fetch_one(&state.db).await?;
        let msg_json = json!({
            "id": msg.try_get::<String,_>("id").unwrap_or_default(),
            "conversationId": msg.try_get::<String,_>("conversationId").unwrap_or_default(),
            "senderId": msg.try_get::<String,_>("senderId").unwrap_or_default(),
            "body": msg.try_get::<String,_>("body").unwrap_or_default(),
            "attachmentKey": msg.try_get::<Option<String>,_>("attachmentKey").unwrap_or(None),
            "attachmentName": msg.try_get::<Option<String>,_>("attachmentName").unwrap_or(None),
            "attachmentMime": msg.try_get::<Option<String>,_>("attachmentMime").unwrap_or(None),
            "attachmentSize": msg.try_get::<Option<i32>,_>("attachmentSize").unwrap_or(None),
            "createdAt": msg.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
        });
        return Ok(Json(json!({"message": msg_json})));
    }

    // new conversation
    let ctype = input.conv_type.clone().ok_or_else(|| {
        AppError::BadRequest(
            "type (DIRECT | BATCH) is required when conversationId is omitted".into(),
        )
    })?;
    let conv_id = Uuid::new_v4().to_string();
    if ctype == "BATCH" {
        let bid = input
            .batch_id
            .clone()
            .ok_or_else(|| AppError::BadRequest("batchId is required for BATCH type".into()))?;
        let batch = sqlx::query("SELECT id,\"coordinatorId\" FROM \"Batch\" WHERE id=$1")
            .bind(&bid)
            .fetch_optional(&state.db)
            .await?
            .ok_or_else(|| AppError::NotFound)?;
        let coord: String = batch.try_get("coordinatorId")?;
        if coord != auth.0.sub && auth.0.role != "SUPERADMIN" {
            return Err(AppError::Forbidden);
        }
        // students
        let students = sqlx::query("SELECT id FROM \"User\" WHERE \"batchId\"=$1")
            .bind(&bid)
            .fetch_all(&state.db)
            .await
            .unwrap_or_default();
        let mut tx = state.db.begin().await?;
        sqlx::query("INSERT INTO \"Conversation\" (id,type,\"batchId\",\"createdAt\",\"updatedAt\") VALUES ($1,'BATCH',$2,NOW(),NOW())")
            .bind(&conv_id).bind(&bid).execute(&mut *tx).await?;
        // members: coordinator + students
        sqlx::query("INSERT INTO \"ConversationMember\" (id,\"conversationId\",\"userId\",\"joinedAt\") VALUES ($1,$2,$3,NOW())")
            .bind(Uuid::new_v4().to_string()).bind(&conv_id).bind(&auth.0.sub).execute(&mut *tx).await?;
        for s in students {
            let sid: String = s.try_get("id")?;
            if sid == auth.0.sub {
                continue;
            }
            sqlx::query("INSERT INTO \"ConversationMember\" (id,\"conversationId\",\"userId\",\"joinedAt\") VALUES ($1,$2,$3,NOW()) ON CONFLICT DO NOTHING")
                .bind(Uuid::new_v4().to_string()).bind(&conv_id).bind(&sid).execute(&mut *tx).await?;
        }
        tx.commit().await?;
    } else if ctype == "DIRECT" {
        let rids = input.recipient_ids.clone().ok_or_else(|| {
            AppError::BadRequest("recipientIds is required for DIRECT type".into())
        })?;
        if rids.is_empty() {
            return Err(AppError::BadRequest(
                "recipientIds is required for DIRECT type".into(),
            ));
        }
        // validate recipients
        for rid in &rids {
            let r = sqlx::query("SELECT id FROM \"User\" WHERE id=$1 AND role::text IN ('ADMIN','STUDENT') AND status::text='ACTIVE'")
                .bind(rid).fetch_optional(&state.db).await?;
            if r.is_none() {
                return Err(AppError::NotFound);
            }
        }
        let mut tx = state.db.begin().await?;
        sqlx::query("INSERT INTO \"Conversation\" (id,type,\"createdAt\",\"updatedAt\") VALUES ($1,'DIRECT',NOW(),NOW())")
            .bind(&conv_id).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO \"ConversationMember\" (id,\"conversationId\",\"userId\",\"joinedAt\") VALUES ($1,$2,$3,NOW())")
            .bind(Uuid::new_v4().to_string()).bind(&conv_id).bind(&auth.0.sub).execute(&mut *tx).await?;
        for rid in &rids {
            sqlx::query("INSERT INTO \"ConversationMember\" (id,\"conversationId\",\"userId\",\"joinedAt\") VALUES ($1,$2,$3,NOW()) ON CONFLICT DO NOTHING")
                .bind(Uuid::new_v4().to_string()).bind(&conv_id).bind(rid).execute(&mut *tx).await?;
        }
        tx.commit().await?;
    } else {
        return Err(AppError::BadRequest("Invalid type".into()));
    }

    // create message
    let mid = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO \"Message\" (id,\"conversationId\",\"senderId\",body,\"attachmentKey\",\"attachmentName\",\"attachmentMime\",\"attachmentSize\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())")
        .bind(&mid).bind(&conv_id).bind(&auth.0.sub).bind(input.body.trim())
        .bind(input.attachment_key.as_deref()).bind(input.attachment_name.as_deref())
        .bind(input.attachment_mime.as_deref()).bind(input.attachment_size.map(|x| x as i32))
        .execute(&state.db).await?;
    sqlx::query("UPDATE \"Conversation\" SET \"updatedAt\"=NOW() WHERE id=$1")
        .bind(&conv_id)
        .execute(&state.db)
        .await?;
    write_audit_log(
        &state,
        Some(&auth.0.sub),
        "MESSAGE_SENT",
        "Message",
        &mid,
        json!({"conversationId": conv_id}),
    )
    .await
    .ok();

    // fetch conversation
    let conv_row = sqlx::query("SELECT id,type::text,\"batchId\",\"createdAt\"::timestamptz,\"updatedAt\"::timestamptz FROM \"Conversation\" WHERE id=$1").bind(&conv_id).fetch_one(&state.db).await?;
    let conv_json = json!({
        "id": conv_row.try_get::<String,_>("id").unwrap_or_default(),
        "type": conv_row.try_get::<String,_>("type").unwrap_or_default(),
        "batchId": conv_row.try_get::<Option<String>,_>("batchId").unwrap_or(None),
        "createdAt": conv_row.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
        "updatedAt": conv_row.try_get::<chrono::DateTime<Utc>,_>("updatedAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
    });
    let msg = sqlx::query("SELECT id,\"conversationId\",\"senderId\",body,\"attachmentKey\",\"attachmentName\",\"attachmentMime\",\"attachmentSize\",\"createdAt\"::timestamptz FROM \"Message\" WHERE id=$1").bind(&mid).fetch_one(&state.db).await?;
    let msg_json = json!({
        "id": msg.try_get::<String,_>("id").unwrap_or_default(),
        "conversationId": msg.try_get::<String,_>("conversationId").unwrap_or_default(),
        "senderId": msg.try_get::<String,_>("senderId").unwrap_or_default(),
        "body": msg.try_get::<String,_>("body").unwrap_or_default(),
        "attachmentKey": msg.try_get::<Option<String>,_>("attachmentKey").unwrap_or(None),
        "attachmentName": msg.try_get::<Option<String>,_>("attachmentName").unwrap_or(None),
        "attachmentMime": msg.try_get::<Option<String>,_>("attachmentMime").unwrap_or(None),
        "attachmentSize": msg.try_get::<Option<i32>,_>("attachmentSize").unwrap_or(None),
        "createdAt": msg.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
    });
    Ok(Json(
        json!({"message": msg_json, "conversation": conv_json}),
    ))
}

async fn send_to_conv(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(conv_id): Path<String>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>> {
    if !can_msg(&auth.0.role) {
        return Err(AppError::Forbidden);
    }
    #[derive(Deserialize)]
    struct B {
        body: String,
        #[serde(rename = "attachmentKey")]
        attachment_key: Option<String>,
        #[serde(rename = "attachmentName")]
        attachment_name: Option<String>,
        #[serde(rename = "attachmentMime")]
        attachment_mime: Option<String>,
        #[serde(rename = "attachmentSize")]
        attachment_size: Option<i64>,
    }
    let b: B =
        serde_json::from_value(body).map_err(|_| AppError::BadRequest("Invalid input".into()))?;
    if b.body.trim().is_empty() {
        return Err(AppError::BadRequest("Message body is required".into()));
    }
    let is_member: i64 = sqlx::query("SELECT COUNT(*) as c FROM \"ConversationMember\" WHERE \"conversationId\"=$1 AND \"userId\"=$2")
        .bind(&conv_id).bind(&auth.0.sub).fetch_one(&state.db).await?.try_get("c").unwrap_or(0);
    if is_member == 0 {
        return Err(AppError::NotFound);
    }
    let mid = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO \"Message\" (id,\"conversationId\",\"senderId\",body,\"attachmentKey\",\"attachmentName\",\"attachmentMime\",\"attachmentSize\",\"createdAt\") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())")
        .bind(&mid).bind(&conv_id).bind(&auth.0.sub).bind(b.body.trim())
        .bind(b.attachment_key.as_deref()).bind(b.attachment_name.as_deref())
        .bind(b.attachment_mime.as_deref()).bind(b.attachment_size.map(|x| x as i32))
        .execute(&state.db).await?;
    sqlx::query("UPDATE \"Conversation\" SET \"updatedAt\"=NOW() WHERE id=$1")
        .bind(&conv_id)
        .execute(&state.db)
        .await?;
    write_audit_log(
        &state,
        Some(&auth.0.sub),
        "MESSAGE_SENT",
        "Message",
        &mid,
        json!({"conversationId": conv_id}),
    )
    .await
    .ok();
    let msg = sqlx::query("SELECT id,\"conversationId\",\"senderId\",body,\"attachmentKey\",\"attachmentName\",\"attachmentMime\",\"attachmentSize\",\"createdAt\"::timestamptz FROM \"Message\" WHERE id=$1")
        .bind(&mid).fetch_one(&state.db).await?;
    Ok(Json(json!({"message": {
        "id": msg.try_get::<String,_>("id").unwrap_or_default(),
        "conversationId": msg.try_get::<String,_>("conversationId").unwrap_or_default(),
        "senderId": msg.try_get::<String,_>("senderId").unwrap_or_default(),
        "body": msg.try_get::<String,_>("body").unwrap_or_default(),
        "attachmentKey": msg.try_get::<Option<String>,_>("attachmentKey").unwrap_or(None),
        "attachmentName": msg.try_get::<Option<String>,_>("attachmentName").unwrap_or(None),
        "attachmentMime": msg.try_get::<Option<String>,_>("attachmentMime").unwrap_or(None),
        "attachmentSize": msg.try_get::<Option<i32>,_>("attachmentSize").unwrap_or(None),
        "createdAt": msg.try_get::<chrono::DateTime<Utc>,_>("createdAt").map(|d| d.to_rfc3339()).unwrap_or_default(),
    }})))
}
