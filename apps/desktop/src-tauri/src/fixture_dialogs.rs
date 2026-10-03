//! Native acceptance only. Missing queue responses never open a real picker.
use serde_json::Value;
use std::{
    fs,
    path::{Path, PathBuf},
};
pub fn take(root: &Path, method: &str) -> Result<Value, &'static str> {
    if !root.is_absolute() || !root.join(".leafloom-fixture").is_file() {
        return Err("UNAUTHORIZED");
    }
    let root = root.canonicalize().map_err(|_| "UNAUTHORIZED")?;
    let file = root.join(".leafloom-dialogs.json");
    let meta = fs::symlink_metadata(&file).map_err(|_| "FIXTURE_DIALOG_UNAVAILABLE")?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > 65536 {
        return Err("UNAUTHORIZED");
    }
    let mut queues: Value =
        serde_json::from_slice(&fs::read(&file).map_err(|_| "FIXTURE_DIALOG_UNAVAILABLE")?)
            .map_err(|_| "INVALID")?;
    let queue = queues
        .get_mut(method)
        .and_then(Value::as_array_mut)
        .ok_or("FIXTURE_DIALOG_UNAVAILABLE")?;
    if queue.is_empty() {
        return Err("FIXTURE_DIALOG_UNAVAILABLE");
    }
    let reply = queue.remove(0);
    let paths: Vec<&str> = match method {
        "selectImportFiles" => reply
            .as_array()
            .ok_or("INVALID")?
            .iter()
            .map(|p| p.as_str().ok_or("INVALID"))
            .collect::<Result<_, _>>()?,
        "selectExportFile" | "selectCoverImage" | "selectCover" => {
            if reply.is_null() {
                Vec::new()
            } else {
                vec![reply.as_str().ok_or("INVALID")?]
            }
        }
        _ => return Err("FIXTURE_DIALOG_UNAVAILABLE"),
    };
    for path in paths {
        let path = PathBuf::from(path);
        if !path.is_absolute()
            || path
                .components()
                .any(|p| matches!(p, std::path::Component::ParentDir))
        {
            return Err("UNAUTHORIZED");
        }
        let checked = if method == "selectExportFile" && !path.exists() {
            path.parent()
                .ok_or("UNAUTHORIZED")?
                .canonicalize()
                .map_err(|_| "UNAUTHORIZED")?
        } else {
            path.canonicalize().map_err(|_| "UNAUTHORIZED")?
        };
        if method != "selectExportFile" && !checked.is_file() {
            return Err("INVALID");
        }
        if !checked.starts_with(&root)
            || (checked == root && (method != "selectExportFile" || path.exists()))
        {
            return Err("UNAUTHORIZED");
        }
    }
    fs::write(file, serde_json::to_vec(&queues).map_err(|_| "INVALID")?)
        .map_err(|_| "FIXTURE_DIALOG_UNAVAILABLE")?;
    Ok(reply)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cancellation_exhaustion_and_escape_are_bounded() {
        let root = std::env::temp_dir().join(format!("leafloom-dialog-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        fs::write(root.join(".leafloom-fixture"), "").unwrap();
        fs::write(root.join("input.txt"), "fixture").unwrap();
        let queue = root.join(".leafloom-dialogs.json");
        fs::write(&queue,serde_json::json!({"selectImportFiles":[[root.join("input.txt")],[]],"selectExportFile":[root.join("result.pdf"),null]}).to_string()).unwrap();
        assert_eq!(
            take(&root, "selectImportFiles")
                .unwrap()
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            take(&root, "selectImportFiles").unwrap(),
            serde_json::json!([])
        );
        assert_eq!(
            take(&root, "selectImportFiles"),
            Err("FIXTURE_DIALOG_UNAVAILABLE")
        );
        assert!(take(&root, "selectExportFile").unwrap().is_string());
        assert!(take(&root, "selectExportFile").unwrap().is_null());
        fs::write(
            &queue,
            serde_json::json!({"selectCoverImage":[root.join("input.txt"),null]}).to_string(),
        )
        .unwrap();
        assert!(take(&root, "selectCoverImage").unwrap().is_string());
        assert!(take(&root, "selectCoverImage").unwrap().is_null());
        fs::write(
            &queue,
            serde_json::json!({"selectExportFile":[root.join("../escape.pdf")]}).to_string(),
        )
        .unwrap();
        assert_eq!(take(&root, "selectExportFile"), Err("UNAUTHORIZED"));
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(std::env::temp_dir(), root.join("escape")).unwrap();
            fs::write(
                &queue,
                serde_json::json!({"selectExportFile":[root.join("escape/result.pdf")]})
                    .to_string(),
            )
            .unwrap();
            assert_eq!(take(&root, "selectExportFile"), Err("UNAUTHORIZED"));
        }
        fs::remove_dir_all(root).unwrap();
    }
}
