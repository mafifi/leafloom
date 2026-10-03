use serde::Serialize;
use std::{collections::HashSet, path::PathBuf};

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct DropPosition {
    pub x: f64,
    pub y: f64,
}
#[derive(Clone, Debug, Serialize)]
pub struct ExternalDrop {
    pub paths: Vec<PathBuf>,
    pub position: Option<DropPosition>,
}
#[derive(Clone, Copy)]
pub enum CoordinateSpace {
    Logical,
    Physical,
}

/// Wry 0.55.1: Cocoa draggingLocation and GTK drag-drop are logical client
/// points; Windows ScreenToClient supplies physical pixels. The Tauri wrapper
/// labels all three PhysicalPosition without conversion (runtime-wry 2.11.4).
/// Normalize only Windows, so a Retina drop is not divided by scale twice.
pub fn prepare_drop(
    paths: &[PathBuf],
    x: f64,
    y: f64,
    space: CoordinateSpace,
    scale: f64,
    grants: &mut HashSet<PathBuf>,
) -> Option<ExternalDrop> {
    let divisor = match space {
        CoordinateSpace::Logical => 1.0,
        CoordinateSpace::Physical if scale.is_finite() && scale > 0.0 => scale,
        CoordinateSpace::Physical => return None,
    };
    let position = DropPosition {
        x: x / divisor,
        y: y / divisor,
    };
    if !position.x.is_finite()
        || !position.y.is_finite()
        || !(0.0..=1_000_000.0).contains(&position.x)
        || !(0.0..=1_000_000.0).contains(&position.y)
    {
        return None;
    }
    let mut seen = HashSet::new();
    let selected: Vec<PathBuf> = paths
        .iter()
        .filter(|path| {
            if !path.is_absolute() || !seen.insert((*path).clone()) {
                return false;
            }
            let Ok(meta) = std::fs::symlink_metadata(path) else {
                return false;
            };
            !meta.is_symlink()
                && (meta.is_dir()
                    || meta.is_file()
                        && path.extension().and_then(|v| v.to_str()).is_some_and(|v| {
                            ["docx", "txt", "md", "png", "jpg", "jpeg", "webp"]
                                .contains(&v.to_ascii_lowercase().as_str())
                        }))
        })
        .cloned()
        .collect();
    if selected.is_empty() || selected.len() > 1000 {
        return None;
    }
    for path in &selected {
        grants.insert(path.clone());
    }
    Some(ExternalDrop {
        paths: selected,
        position: Some(position),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{create_dir, remove_dir_all, write};
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!("leafloom-drop-{}", uuid::Uuid::new_v4()));
            create_dir(&root).unwrap();
            Self(root)
        }
        fn file(&self, name: &str) -> PathBuf {
            let p = self.0.join(name);
            write(&p, b"synthetic author input").unwrap();
            p
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            remove_dir_all(&self.0).unwrap();
        }
    }
    #[test]
    fn macos_and_gtk_client_points_are_already_logical_and_windows_pixels_are_scaled_once() {
        let fixture = Fixture::new();
        let file = fixture.file("story.txt");
        let cases = [
            (
                CoordinateSpace::Logical,
                2.0,
                Some(DropPosition { x: 240.0, y: 120.0 }),
            ),
            (
                CoordinateSpace::Physical,
                2.0,
                Some(DropPosition { x: 120.0, y: 60.0 }),
            ),
            (
                CoordinateSpace::Physical,
                1.5,
                Some(DropPosition { x: 160.0, y: 80.0 }),
            ),
        ];
        for (space, scale, expected) in cases {
            let mut grants = HashSet::new();
            let drop =
                prepare_drop(&[file.clone()], 240.0, 120.0, space, scale, &mut grants).unwrap();
            assert_eq!(drop.position, expected);
            assert!(grants.contains(&file));
        }
    }
    #[test]
    fn invalid_or_canceled_drop_never_adds_a_path_grant() {
        let fixture = Fixture::new();
        let file = fixture.file("story.txt");
        let mut grants = HashSet::from([fixture.0.join("already-authorized.txt")]);
        let before = grants.clone();
        for (x, y, scale) in [
            (f64::NAN, 0.0, 2.0),
            (0.0, f64::INFINITY, 2.0),
            (-1.0, 0.0, 2.0),
            (2_000_002.0, 0.0, 2.0),
            (1.0, 1.0, 0.0),
        ] {
            assert!(prepare_drop(
                &[file.clone()],
                x,
                y,
                CoordinateSpace::Physical,
                scale,
                &mut grants
            )
            .is_none());
            assert_eq!(grants, before);
        }
        assert!(prepare_drop(&[], 1.0, 1.0, CoordinateSpace::Logical, 2.0, &mut grants).is_none());
        assert_eq!(grants, before);
    }
    #[test]
    fn grants_only_supported_regular_files_or_real_directories_with_stable_deduplicated_paths() {
        let fixture = Fixture::new();
        let valid = fixture.file("story.TXT");
        let unsupported = fixture.file("script.js");
        let folder = fixture.0.join("legacy");
        create_dir(&folder).unwrap();
        let mut paths = vec![
            valid.clone(),
            unsupported,
            fixture.0.join("missing.txt"),
            valid.clone(),
            folder.clone(),
        ];
        #[cfg(unix)]
        {
            let link = fixture.0.join("link.png");
            std::os::unix::fs::symlink(&valid, &link).unwrap();
            paths.push(link);
        }
        let mut grants = HashSet::new();
        let drop = prepare_drop(
            &paths,
            10.0,
            20.0,
            CoordinateSpace::Logical,
            2.0,
            &mut grants,
        )
        .unwrap();
        assert_eq!(drop.paths, vec![valid.clone(), folder.clone()]);
        assert_eq!(grants, HashSet::from([valid.clone(), folder]));
        assert_eq!(std::fs::read(valid).unwrap(), b"synthetic author input");
    }
    #[cfg(unix)]
    #[test]
    fn never_grants_a_fifo_with_an_image_extension() {
        use std::{ffi::CString, os::unix::ffi::OsStrExt};
        let fixture = Fixture::new();
        let fifo = fixture.0.join("pipe.png");
        let name = CString::new(fifo.as_os_str().as_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(name.as_ptr(), 0o600) }, 0);
        let mut grants = HashSet::new();
        assert!(prepare_drop(
            &[fifo],
            10.0,
            20.0,
            CoordinateSpace::Logical,
            2.0,
            &mut grants
        )
        .is_none());
        assert!(grants.is_empty());
    }
}
