//! Pre-host diagnostics share the existing profile resolver and contain no error text.
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::mpsc,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

const MAX_BYTES: u64 = 16 * 1024;
const MAX_RECORDS: usize = 32;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum Code {
    InvalidProfile,
    ProfileUnavailable,
    LibraryBusy,
    LibraryUnavailable,
    HostUnavailable,
    StartupUnavailable,
}
impl Code {
    pub fn from_message(message: &str) -> Self {
        for (name, code) in [
            ("INVALID_PROFILE", Self::InvalidProfile),
            ("PROFILE_UNAVAILABLE", Self::ProfileUnavailable),
            ("LIBRARY_BUSY", Self::LibraryBusy),
            ("LIBRARY_UNAVAILABLE", Self::LibraryUnavailable),
            ("HOST_UNAVAILABLE", Self::HostUnavailable),
        ] {
            if message.contains(name) {
                return code;
            }
        }
        Self::StartupUnavailable
    }
    pub fn label(self) -> &'static str {
        match self {
            Self::InvalidProfile => "INVALID_PROFILE",
            Self::ProfileUnavailable => "PROFILE_UNAVAILABLE",
            Self::LibraryBusy => "LIBRARY_BUSY",
            Self::LibraryUnavailable => "LIBRARY_UNAVAILABLE",
            Self::HostUnavailable => "HOST_UNAVAILABLE",
            Self::StartupUnavailable => "STARTUP_UNAVAILABLE",
        }
    }
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Record {
    source: Source,
    code: Code,
    #[serde(rename = "atUnixMs")]
    at_unix_ms: u64,
}
#[derive(Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum Source {
    Shell,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Log {
    version: u8,
    records: Vec<Record>,
}

/// Same config directory and identifier used by pinned Tauri app_config_dir.
pub fn profile_path(identifier: &str) -> Result<PathBuf, &'static str> {
    #[cfg(debug_assertions)]
    if let Some(root) = std::env::var_os("LEAFLOOM_FIXTURE_ROOT") {
        return fixture_profile_path(Path::new(&root));
    }
    dirs::config_dir()
        .map(|root| root.join(identifier).join("host-settings.json"))
        .ok_or("PROFILE_UNAVAILABLE")
}
#[cfg(any(debug_assertions, test))]
fn fixture_profile_path(root: &Path) -> Result<PathBuf, &'static str> {
    if !root.is_absolute() || !root.join(".leafloom-fixture").is_file() {
        return Err("INVALID_PROFILE");
    }
    Ok(root.join(".profile/host-settings.json"))
}

fn persist(profile: &Path, code: Code) -> Result<(), String> {
    let path = profile.with_file_name("startup-errors.json");
    let parent = path.parent().ok_or("PROFILE_UNAVAILABLE")?;
    if let Ok(meta) = fs::symlink_metadata(parent) {
        if meta.is_symlink() || !meta.is_dir() {
            return Err("PROFILE_UNAVAILABLE".into());
        }
    }
    let mut log = match fs::symlink_metadata(&path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Log {
            version: 1,
            records: vec![],
        },
        Err(_) => return Err("PROFILE_UNAVAILABLE".into()),
        Ok(meta) if meta.is_symlink() || !meta.is_file() || meta.len() > MAX_BYTES => {
            return Err("INVALID_PROFILE".into())
        }
        Ok(_) => {
            let mut options = fs::OpenOptions::new();
            options.read(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::OpenOptionsExt;
                options.custom_flags(libc::O_NOFOLLOW);
            }
            let file = options.open(&path).map_err(|_| "PROFILE_UNAVAILABLE")?;
            if !file
                .metadata()
                .map_err(|_| "PROFILE_UNAVAILABLE")?
                .is_file()
            {
                return Err("INVALID_PROFILE".into());
            }
            let mut bytes = Vec::new();
            file.take(MAX_BYTES + 1)
                .read_to_end(&mut bytes)
                .map_err(|_| "PROFILE_UNAVAILABLE")?;
            if bytes.len() as u64 > MAX_BYTES {
                return Err("INVALID_PROFILE".into());
            }
            let loaded: Log = serde_json::from_slice(&bytes).map_err(|_| "INVALID_PROFILE")?;
            if loaded.version != 1
                || loaded.records.len() > MAX_RECORDS
                || loaded
                    .records
                    .iter()
                    .any(|row| row.at_unix_ms > 9_007_199_254_740_991)
            {
                return Err("INVALID_PROFILE".into());
            }
            loaded
        }
    };
    if log.records.len() == MAX_RECORDS {
        log.records.remove(0);
    }
    let at_unix_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "PROFILE_UNAVAILABLE")?
        .as_millis()
        .min(9_007_199_254_740_991) as u64;
    log.records.push(Record {
        source: Source::Shell,
        code,
        at_unix_ms,
    });
    crate::preferences::write(
        &path,
        &serde_json::to_value(log).map_err(|_| "INVALID_PROFILE")?,
    )
}

/// A blocked filesystem cannot hold fatal shutdown indefinitely; errors are discarded.
pub fn record(profile: Option<PathBuf>, code: Code) {
    if let Some(profile) = profile {
        bounded(Duration::from_millis(500), move || {
            let _ = persist(&profile, code);
        });
    }
}
fn bounded(timeout: Duration, action: impl FnOnce() + Send + 'static) {
    let (sent, received) = mpsc::channel();
    if std::thread::Builder::new()
        .name("startup-diagnostic".into())
        .spawn(move || {
            action();
            let _ = sent.send(());
        })
        .is_ok()
    {
        let _ = received.recv_timeout(timeout);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> PathBuf {
        let root =
            std::env::temp_dir().join(format!("leafloom-startup-log-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join(".profile")).unwrap();
        fs::write(root.join(".leafloom-fixture"), "").unwrap();
        root
    }
    #[test]
    fn finite_records_are_bounded_and_leave_profile_and_author_bytes_untouched() {
        let root = fixture();
        let profile = fixture_profile_path(&root).unwrap();
        fs::write(&profile, b"{broken synthetic profile").unwrap();
        fs::write(root.join("author"), b"protected prose").unwrap();
        for index in 0..40 {
            persist(
                &profile,
                if index == 39 {
                    Code::HostUnavailable
                } else {
                    Code::InvalidProfile
                },
            )
            .unwrap();
        }
        let bytes = fs::read(profile.with_file_name("startup-errors.json")).unwrap();
        let log: Log = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(log.records.len(), MAX_RECORDS);
        assert_eq!(log.records.last().unwrap().code, Code::HostUnavailable);
        assert!(bytes.len() < MAX_BYTES as usize);
        assert!(!String::from_utf8(bytes)
            .unwrap()
            .contains("protected prose"));
        assert_eq!(fs::read(&profile).unwrap(), b"{broken synthetic profile");
        assert_eq!(fs::read(root.join("author")).unwrap(), b"protected prose");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(profile.with_file_name("startup-errors.json"))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn corrupt_oversized_and_unknown_records_are_preserved_without_append() {
        let root = fixture();
        let profile = fixture_profile_path(&root).unwrap();
        let log = profile.with_file_name("startup-errors.json");
        for bytes in [
            b"{broken".to_vec(),
            vec![b'x'; MAX_BYTES as usize + 1],
            br#"{"version":1,"records":[{"source":"shell","code":"SECRET_TEXT","atUnixMs":1}]}"#
                .to_vec(),
        ] {
            fs::write(&log, &bytes).unwrap();
            assert!(persist(&profile, Code::InvalidProfile).is_err());
            assert_eq!(fs::read(&log).unwrap(), bytes);
        }
        fs::remove_dir_all(root).unwrap();
    }
    #[cfg(unix)]
    #[test]
    fn symlink_log_and_parent_never_modify_targets() {
        use std::os::unix::fs::symlink;
        let root = fixture();
        let profile = fixture_profile_path(&root).unwrap();
        let target = root.join("sentinel");
        fs::write(&target, "protected").unwrap();
        let log = profile.with_file_name("startup-errors.json");
        symlink(&target, &log).unwrap();
        assert!(persist(&profile, Code::InvalidProfile).is_err());
        assert_eq!(fs::read_to_string(&target).unwrap(), "protected");
        fs::remove_file(log).unwrap();
        fs::remove_dir(root.join(".profile")).unwrap();
        let outside = root.join("outside");
        fs::create_dir(&outside).unwrap();
        symlink(&outside, root.join(".profile")).unwrap();
        assert!(persist(&profile, Code::InvalidProfile).is_err());
        assert!(!outside.join("startup-errors.json").exists());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn timeout_and_failed_write_do_not_block_fatal_shutdown() {
        let began = std::time::Instant::now();
        bounded(Duration::from_millis(20), || {
            std::thread::sleep(Duration::from_millis(200))
        });
        assert!(began.elapsed() < Duration::from_millis(150));
        record(
            Some(PathBuf::from("/dev/null/host-settings.json")),
            Code::StartupUnavailable,
        );
    }
    #[test]
    fn resolver_and_mapping_keep_only_known_authority_and_categories() {
        assert!(fixture_profile_path(Path::new("relative")).is_err());
        let root = fixture();
        assert_eq!(
            fixture_profile_path(&root).unwrap(),
            root.join(".profile/host-settings.json")
        );
        assert_eq!(
            Code::from_message("private path INVALID_PROFILE: private prose").label(),
            "INVALID_PROFILE"
        );
        assert_eq!(
            Code::from_message("private unknown failure").label(),
            "STARTUP_UNAVAILABLE"
        );
        fs::remove_dir_all(root).unwrap();
    }
}
