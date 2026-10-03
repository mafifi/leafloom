use std::io::Write;
use std::path::{Path, PathBuf};

/// An owned file avoids navigation URL limits for long manuscripts and fonts.
pub struct PrintDocument {
    directory: PathBuf,
    path: PathBuf,
}
impl PrintDocument {
    pub fn new(html: &str) -> Result<Self, &'static str> {
        if !html.contains("<head>") {
            return Err("HOST_PROTOCOL");
        }
        let directory =
            std::env::temp_dir().join(format!("leafloom-print-{}", uuid::Uuid::new_v4()));
        let mut builder = std::fs::DirBuilder::new();
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(&directory).map_err(|_| "OS_UNAVAILABLE")?;
        let directory = match directory.canonicalize() {
            Ok(value) => value,
            Err(_) => {
                let _ = std::fs::remove_dir(&directory);
                return Err("OS_UNAVAILABLE");
            }
        };
        let document = Self {
            path: directory.join("manuscript.html"),
            directory,
        };
        let csp="<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; frame-src 'none'; base-uri 'none'; form-action 'none'\">";
        let html = html.replacen("<head>", &format!("<head>{csp}"), 1);
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&document.path).map_err(|_| "OS_UNAVAILABLE")?;
        file.write_all(html.as_bytes())
            .and_then(|_| file.sync_all())
            .map_err(|_| "OS_UNAVAILABLE")?;
        Ok(document)
    }
    pub fn path(&self) -> &Path {
        &self.path
    }
    pub fn cleanup(&self) {
        let _ = std::fs::remove_file(&self.path);
        let _ = std::fs::remove_dir(&self.directory);
    }
}
impl Drop for PrintDocument {
    fn drop(&mut self) {
        self.cleanup();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn large_unicode_manuscript_is_a_private_file_with_restrictive_policy_and_owned_cleanup() {
        let prose = "作者 café 🖋".repeat(300_000);
        let html = format!(
            "<!DOCTYPE html><html><head><title>Fixture</title></head><body>{prose}</body></html>"
        );
        let document = PrintDocument::new(&html).unwrap();
        let path = document.path().to_path_buf();
        let stored = std::fs::read_to_string(&path).unwrap();
        assert!(stored.len() > 2_000_000);
        assert!(stored.contains(&prose));
        assert!(stored.contains("font-src data:"));
        assert!(stored.contains("default-src 'none'"));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                std::fs::metadata(&path).unwrap().permissions().mode() & 0o777,
                0o600
            );
            assert_eq!(
                std::fs::metadata(path.parent().unwrap())
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o700
            );
        }
        drop(document);
        assert!(!path.exists());
        assert!(!path.parent().unwrap().exists());
        assert!(PrintDocument::new("not a rendered document").is_err());
    }
}
