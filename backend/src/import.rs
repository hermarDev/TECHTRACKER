use crate::audit;
use crate::auth::hash_password;
use crate::error::{AppError, Result};
use crate::middleware::AuthUser;
use crate::state::AppState;
use axum::extract::{Multipart, State};
use axum::Json;
use calamine::{open_workbook_auto_from_rs, Reader};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::Row;
use std::collections::HashMap;
use std::io::Cursor;

pub const MAX_IMPORT_BYTES: usize = 5 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImportRow {
    pub email: Option<String>,
    #[serde(rename = "studentIdNo")]
    pub student_id_no: Option<String>,
    #[serde(rename = "fullName")]
    pub full_name: Option<String>,
    pub program: Option<String>,
    pub section: Option<String>,
    pub password: Option<String>,
}

pub fn normalize_row_map(row: &HashMap<String, String>) -> ImportRow {
    let get = |key: &str| -> Option<String> {
        let kl = key.to_lowercase();
        let val = row
            .iter()
            .find(|(k, _)| k.to_lowercase() == kl)
            .map(|(_, v)| v);
        match val {
            Some(v) => {
                let t = v.trim();
                if t.is_empty() {
                    None
                } else {
                    Some(t.to_string())
                }
            }
            None => None,
        }
    };
    ImportRow {
        email: get("email"),
        student_id_no: get("studentIdNo").or_else(|| get("student_id")),
        full_name: get("fullName").or_else(|| get("name")),
        program: get("program"),
        section: get("section"),
        password: get("password"),
    }
}

pub fn parse_csv_bytes(bytes: &[u8]) -> Result<Vec<ImportRow>> {
    let bytes = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        &bytes[3..]
    } else {
        bytes
    };
    let text = String::from_utf8_lossy(bytes);
    let mut rdr = csv::ReaderBuilder::new()
        .flexible(true)
        .from_reader(text.as_bytes());
    let headers = rdr
        .headers()
        .map_err(|e| AppError::BadRequest(e.to_string()))?
        .clone();
    let mut out = Vec::new();
    for rec in rdr.records() {
        let record = rec.map_err(|e| AppError::BadRequest(e.to_string()))?;
        let mut map = HashMap::new();
        for (i, h) in headers.iter().enumerate() {
            let v = record.get(i).unwrap_or("").to_string();
            map.insert(h.to_string(), v);
        }
        out.push(normalize_row_map(&map));
    }
    Ok(out)
}

pub fn parse_xlsx_bytes(bytes: &[u8]) -> Result<Vec<ImportRow>> {
    let cursor = Cursor::new(bytes.to_vec());
    let mut workbook =
        open_workbook_auto_from_rs(cursor).map_err(|e| AppError::BadRequest(e.to_string()))?;
    let sheet_names = workbook.sheet_names();
    let sheet_name = sheet_names
        .first()
        .ok_or_else(|| AppError::BadRequest("No sheet found".into()))?
        .clone();
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|e| AppError::BadRequest(e.to_string()))?;
    let mut rows = range.rows();
    let headers: Vec<String> = match rows.next() {
        Some(r) => r.iter().map(|c| c.to_string()).collect(),
        None => return Ok(Vec::new()),
    };
    let mut out = Vec::new();
    for row in rows {
        let mut map = HashMap::new();
        for (i, h) in headers.iter().enumerate() {
            let v = row.get(i).map(|c| c.to_string()).unwrap_or_default();
            map.insert(h.clone(), v);
        }
        out.push(normalize_row_map(&map));
    }
    Ok(out)
}

pub fn parse_file(name: &str, mime: &str, bytes: &[u8]) -> Result<Vec<ImportRow>> {
    let lower = name.to_lowercase();
    let is_csv = mime == "text/csv" || lower.ends_with(".csv");
    let is_xlsx = mime == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        || lower.ends_with(".xlsx");
    if is_csv {
        parse_csv_bytes(bytes)
    } else if is_xlsx {
        parse_xlsx_bytes(bytes)
    } else {
        Err(AppError::BadRequest(
            "Unsupported file type. Upload CSV or XLSX.".into(),
        ))
    }
}

#[derive(Debug, Clone)]
struct RowError {
    row: ImportRow,
    message: String,
}

pub async fn students_import(
    State(state): State<AppState>,
    auth: AuthUser,
    mut multipart: Multipart,
) -> Result<Json<Value>> {
    if !["ADMIN", "SUPERADMIN"].contains(&auth.0.role.as_str()) {
        return Err(AppError::Forbidden);
    }

    let mut file_bytes: Option<Vec<u8>> = None;
    let mut file_name: Option<String> = None;
    let mut mime: Option<String> = None;
    let mut resolution = "skip".to_string();
    let mut batch_id: Option<String> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        let fname = field.name().unwrap_or("").to_string();
        if fname == "file" {
            file_name = field.file_name().map(|s| s.to_string());
            mime = field.content_type().map(|s| s.to_string());
            let bytes = field
                .bytes()
                .await
                .map_err(|e| AppError::BadRequest(e.to_string()))?;
            file_bytes = Some(bytes.to_vec());
        } else if fname == "duplicateResolution" {
            if let Ok(t) = field.text().await {
                if !t.trim().is_empty() {
                    resolution = t.trim().to_string();
                }
            }
        } else if fname == "batchId" {
            if let Ok(t) = field.text().await {
                let t = t.trim().to_string();
                if !t.is_empty() {
                    batch_id = Some(t);
                }
            }
        }
    }

    let bytes = file_bytes.ok_or_else(|| AppError::BadRequest("No file provided".into()))?;
    let name = file_name.unwrap_or_else(|| "upload.csv".to_string());
    if bytes.is_empty() {
        return Err(AppError::BadRequest("File is empty".into()));
    }
    if bytes.len() > MAX_IMPORT_BYTES {
        return Err(AppError::BadRequest(
            "File exceeds maximum allowed size of 5 MB".into(),
        ));
    }
    let mime = mime.unwrap_or_default();

    if let Some(bid) = &batch_id {
        if auth.0.role == "ADMIN" {
            let row = sqlx::query("SELECT \"coordinatorId\" FROM \"Batch\" WHERE id=$1")
                .bind(bid)
                .fetch_optional(&state.db)
                .await?;
            let coord: Option<String> = row.and_then(|r| r.try_get("coordinatorId").ok());
            if coord.as_deref() != Some(auth.0.sub.as_str()) {
                return Err(AppError::Forbidden);
            }
        }
    }

    let mut rows = parse_file(&name, &mime, &bytes)?;
    rows.retain(|r| r.email.is_some() || r.student_id_no.is_some() || r.full_name.is_some());

    let mut created: Vec<ImportRow> = Vec::new();
    let mut skipped: Vec<ImportRow> = Vec::new();
    let mut overwritten: Vec<ImportRow> = Vec::new();
    let mut flagged: Vec<ImportRow> = Vec::new();
    let mut errors: Vec<RowError> = Vec::new();

    let mut tx = state.db.begin().await?;

    for row in &rows {
        if row.email.is_none() || row.student_id_no.is_none() || row.full_name.is_none() {
            errors.push(RowError {
                row: row.clone(),
                message: "email, studentIdNo and fullName are required".into(),
            });
            continue;
        }
        let email = row.email.as_ref().unwrap().to_lowercase();

        let existing_email = sqlx::query("SELECT id FROM \"User\" WHERE email=$1")
            .bind(&email)
            .fetch_optional(&mut *tx)
            .await?;
        let existing_id_row = if let Some(sid) = &row.student_id_no {
            sqlx::query("SELECT id FROM \"User\" WHERE \"studentIdNo\"=$1")
                .bind(sid)
                .fetch_optional(&mut *tx)
                .await?
        } else {
            None
        };

        let existing_id: Option<String> = existing_email
            .as_ref()
            .or(existing_id_row.as_ref())
            .and_then(|r| r.try_get("id").ok());

        if let Some(_eid) = existing_id {
            match resolution.as_str() {
                "skip" => {
                    skipped.push(row.clone());
                    continue;
                }
                "flag" => {
                    flagged.push(row.clone());
                    continue;
                }
                "overwrite" => {
                    let eid = _eid;
                    if let Some(bid) = &batch_id {
                        sqlx::query(
                            "UPDATE \"User\" SET \"fullName\"=$1, program=$2, section=$3, \"batchId\"=$4, \"updatedAt\"=NOW() WHERE id=$5",
                        )
                        .bind(row.full_name.as_ref().unwrap())
                        .bind(&row.program)
                        .bind(&row.section)
                        .bind(bid)
                        .bind(&eid)
                        .execute(&mut *tx)
                        .await?;
                    } else {
                        sqlx::query(
                            "UPDATE \"User\" SET \"fullName\"=$1, program=$2, section=$3, \"updatedAt\"=NOW() WHERE id=$4",
                        )
                        .bind(row.full_name.as_ref().unwrap())
                        .bind(&row.program)
                        .bind(&row.section)
                        .bind(&eid)
                        .execute(&mut *tx)
                        .await?;
                    }
                    overwritten.push(row.clone());
                    continue;
                }
                _ => {
                    skipped.push(row.clone());
                    continue;
                }
            }
        }

        let pw_hash = match &row.password {
            Some(p) if !p.trim().is_empty() => {
                hash_password(p.trim()).map_err(|e| AppError::Internal(e.to_string()))?
            }
            _ => String::new(),
        };

        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO \"User\" (id, email, \"passwordHash\", \"fullName\", role, status, \"studentIdNo\", program, section, \"batchId\", \"createdAt\", \"updatedAt\") VALUES ($1,$2,$3,$4,'STUDENT','PENDING_VERIFICATION',$5,$6,$7,$8,NOW(),NOW())",
        )
        .bind(&id)
        .bind(&email)
        .bind(&pw_hash)
        .bind(row.full_name.as_ref().unwrap())
        .bind(&row.student_id_no)
        .bind(&row.program)
        .bind(&row.section)
        .bind(&batch_id)
        .execute(&mut *tx)
        .await?;
        created.push(row.clone());
    }

    tx.commit().await?;

    audit::write_audit_log(
        &state,
        Some(&auth.0.sub),
        "STUDENTS_IMPORTED",
        "User",
        "bulk",
        json!({
            "fileName": name,
            "resolution": resolution,
            "created": created.len(),
            "skipped": skipped.len(),
            "overwritten": overwritten.len(),
            "flagged": flagged.len(),
            "errors": errors.len()
        }),
    )
    .await
    .ok();

    let errors_json: Vec<Value> = errors
        .iter()
        .map(|e| {
            json!({
                "row": e.row,
                "message": e.message,
                "error": e.message
            })
        })
        .collect();

    let imported = created.len() + overwritten.len();
    let skipped_count = skipped.len() + flagged.len();

    Ok(Json(json!({
        "imported": imported,
        "skipped": skipped_count,
        "errors": errors_json,
        "created": created,
        "skippedRows": skipped,
        "overwritten": overwritten,
        "flagged": flagged,
        "summary": {
            "created": created.len(),
            "skipped": skipped.len(),
            "overwritten": overwritten.len(),
            "flagged": flagged.len(),
            "errors": errors.len()
        }
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_headers() {
        let mut m = HashMap::new();
        m.insert("Email".to_string(), " A@B.COM ".to_string());
        m.insert("student_id".to_string(), "123".to_string());
        m.insert("name".to_string(), "Jane".to_string());
        let r = normalize_row_map(&m);
        assert_eq!(r.email.as_deref(), Some("A@B.COM"));
        assert_eq!(r.student_id_no.as_deref(), Some("123"));
        assert_eq!(r.full_name.as_deref(), Some("Jane"));
    }

    #[test]
    fn parses_csv() {
        let csv = b"email,studentIdNo,fullName\na@b.com,1,Jane\n,,\n";
        let rows = parse_csv_bytes(csv).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].email.as_deref(), Some("a@b.com"));
    }
}
