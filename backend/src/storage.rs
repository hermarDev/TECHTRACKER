use std::path::PathBuf;
use tokio::fs;

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
}
