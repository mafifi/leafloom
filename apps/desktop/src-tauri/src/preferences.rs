use serde_json::{json, Value};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};
pub fn read(path: &Path) -> Result<Value, String> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.is_symlink() || !meta.is_file() => Err("INVALID_PROFILE".into()),
        Ok(_) => {
            let mut options=OpenOptions::new();options.read(true);
            #[cfg(unix)]{use std::os::unix::fs::OpenOptionsExt;options.custom_flags(libc::O_NOFOLLOW);}
            let file=options.open(path).map_err(|_|"PROFILE_UNAVAILABLE")?;
            if !file.metadata().map_err(|_|"PROFILE_UNAVAILABLE")?.is_file(){return Err("INVALID_PROFILE".into());}
            let value:Value=serde_json::from_reader(file).map_err(|_|"INVALID_PROFILE")?;
            if !value.is_object() {
                return Err("INVALID_PROFILE".into());
            }
            if let Some(folder) = value.get("libraryDir") {
                if !folder.is_string() || !Path::new(folder.as_str().unwrap()).is_absolute() {
                    return Err("INVALID_PROFILE".into());
                }
            }
            Ok(value)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(json!({})),
        Err(_) => Err("PROFILE_UNAVAILABLE".into()),
    }
}
pub fn write(path: &Path, value: &Value) -> Result<(), String> {
    let parent = path.parent().ok_or("INVALID_PROFILE")?;
    fs::create_dir_all(parent).map_err(|_| "PROFILE_UNAVAILABLE")?;
    if fs::symlink_metadata(parent)
        .map_err(|_| "PROFILE_UNAVAILABLE")?
        .is_symlink()
    {
        return Err("INVALID_PROFILE".into());
    }
    if let Ok(meta) = fs::symlink_metadata(path) {
        if meta.is_symlink() || !meta.is_file() {
            return Err("INVALID_PROFILE".into());
        }
    }
    let temp = parent.join(format!(
        ".host-settings-{}-{}.tmp",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| "PROFILE_UNAVAILABLE")?
            .as_nanos()
    ));
    let result = (|| {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp).map_err(|_| "PROFILE_UNAVAILABLE")?;
        file.write_all(
            serde_json::to_string_pretty(value)
                .map_err(|_| "INVALID_PROFILE")?
                .as_bytes(),
        )
        .map_err(|_| "PROFILE_UNAVAILABLE")?;
        file.sync_all().map_err(|_| "PROFILE_UNAVAILABLE")?;
        fs::rename(&temp, path).map_err(|_| "PROFILE_UNAVAILABLE")?;
        #[cfg(unix)]
        fs::File::open(parent)
            .and_then(|file| file.sync_all())
            .map_err(|_| "PROFILE_SAVE_UNCERTAIN")?;
        Ok(())
    })();
    let _ = fs::remove_file(temp);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn profile_preserves_fields_and_rejects_corruption_without_overwrite() {
        let root = std::env::temp_dir().join(format!(
            "leafloom-profile-fixture-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&root).unwrap();
        fs::write(root.join(".leafloom-fixture"), "").unwrap();
        let path = root.join("host-settings.json");
        assert_eq!(read(&path).unwrap(), json!({}));
        let profile = json!({"libraryDir": root, "window": {"width": 1100, "height": 800}});
        write(&path, &profile).unwrap();
        assert_eq!(read(&path).unwrap(), profile);
        fs::write(&path, b"{broken").unwrap();
        assert!(read(&path).is_err());
        assert_eq!(fs::read(&path).unwrap(), b"{broken");
        fs::write(&path, br#"{"libraryDir":"../outside"}"#).unwrap();
        assert!(read(&path).is_err());
        fs::remove_dir_all(root).unwrap();
    }
    #[cfg(unix)]
    #[test]
    fn profile_rejects_symlink_files_without_modifying_target() {
        use std::os::unix::fs::symlink;
        let root = std::env::temp_dir().join(format!(
            "leafloom-profile-symlink-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&root).unwrap();
        fs::write(root.join(".leafloom-fixture"), "").unwrap();
        let target = root.join("target");
        fs::write(&target, "private bytes").unwrap();
        let path = root.join("host-settings.json");
        symlink(&target, &path).unwrap();
        assert!(read(&path).is_err());
        assert!(write(&path, &json!({})).is_err());
        assert_eq!(fs::read_to_string(target).unwrap(), "private bytes");
        fs::remove_dir_all(root).unwrap();
    }
}
