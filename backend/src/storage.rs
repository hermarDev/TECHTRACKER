use axum::extract::multipart::Field;
use std::path::PathBuf;
use tokio::fs;

pub const MAX_UPLOAD_BYTES: usize = 5 * 1024 * 1024;

/// Streams a multipart field and aborts as soon as it exceeds the byte cap.
pub async fn read_field_capped(
    field: &mut Field<'_>,
    max_bytes: usize,
) -> Result<Vec<u8>, &'static str> {
    let mut data = Vec::new();
    while let Some(chunk) = field
        .chunk()
        .await
        .map_err(|_| "Could not read the uploaded file.")?
    {
        if data.len() + chunk.len() > max_bytes {
            return Err("File exceeds maximum allowed size of 5 MB.");
        }
        data.extend_from_slice(&chunk);
    }
    if data.is_empty() {
        return Err("The uploaded file is empty.");
    }
    Ok(data)
}

/// Identifies supported uploads by magic bytes instead of trusting the client MIME type.
pub fn sniff_mime(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some(("image/jpeg", ".jpg"));
    }
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some(("image/png", ".png"));
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some(("image/webp", ".webp"));
    }
    if bytes.starts_with(b"%PDF-") {
        return Some(("application/pdf", ".pdf"));
    }
    None
}

pub fn storage_root() -> PathBuf {
    std::env::var("STORAGE_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(".storage"))
}

pub async fn save_bytes(key: &str, data: &[u8]) -> Result<(), std::io::Error> {
    let path = storage_root().join(key);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }
    fs::write(path, data).await
}

pub fn is_safe_key(key: &str) -> bool {
    !key.is_empty()
        && !key.starts_with('/')
        && !key.contains('\\')
        && !key.contains('\0')
        && key
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..")
}

pub fn resolve_path(key: &str) -> Option<PathBuf> {
    if !is_safe_key(key) {
        return None;
    }
    Some(storage_root().join(key))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_nested_storage_keys() {
        assert!(is_safe_key("uploads/abc.png"));
        assert!(is_safe_key("attendance/2026/abc.jpg"));
    }

    #[test]
    fn rejects_traversal_and_absolute_paths() {
        assert!(!is_safe_key(""));
        assert!(!is_safe_key("/etc/passwd"));
        assert!(!is_safe_key("../secret"));
        assert!(!is_safe_key("uploads/../../secret"));
        assert!(!is_safe_key("uploads/./abc.png"));
        assert!(!is_safe_key("uploads\\abc.png"));
        assert!(!is_safe_key("uploads/abc\0.png"));
    }

    #[test]
    fn resolve_path_rejects_unsafe_keys() {
        assert!(resolve_path("../secret").is_none());
        assert!(resolve_path("uploads/abc.png").is_some());
    }

    #[test]
    fn sniffs_supported_magic_bytes_and_rejects_text() {
        assert_eq!(
            sniff_mime(&[0xFF, 0xD8, 0xFF, 0x00]).unwrap().0,
            "image/jpeg"
        );
        assert_eq!(sniff_mime(b"\x89PNG\r\n\x1a\nrest").unwrap().0, "image/png");
        assert_eq!(sniff_mime(b"RIFF\0\0\0\0WEBPrest").unwrap().0, "image/webp");
        assert_eq!(sniff_mime(b"%PDF-1.7\n").unwrap().0, "application/pdf");
        assert!(sniff_mime(b"<html>not an image</html>").is_none());
        assert!(sniff_mime(b"").is_none());
    }
}
