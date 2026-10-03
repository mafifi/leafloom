use std::{fs::{File,OpenOptions},path::Path};
pub fn acquire(root:&Path)->Result<File,String> {
 std::fs::create_dir_all(root).map_err(|_|"LIBRARY_UNAVAILABLE")?;
 if std::fs::symlink_metadata(root).map_err(|_|"LIBRARY_UNAVAILABLE")?.file_type().is_symlink(){return Err("LIBRARY_UNAVAILABLE".into());}
 let path=root.join(".leafloom-host.lock");
 if std::fs::symlink_metadata(&path).is_ok_and(|s|s.file_type().is_symlink()){return Err("LIBRARY_UNAVAILABLE".into());}
 let mut options=OpenOptions::new();options.read(true).write(true).create(true).truncate(false);
 #[cfg(unix)] {use std::os::unix::fs::OpenOptionsExt;options.mode(0o600).custom_flags(libc::O_NOFOLLOW);}
 let file=options.open(path).map_err(|_|"LIBRARY_UNAVAILABLE")?;
 if !file.metadata().map_err(|_|"LIBRARY_UNAVAILABLE")?.is_file(){return Err("LIBRARY_UNAVAILABLE".into());}
 file.try_lock().map_err(|_|"LIBRARY_BUSY")?;Ok(file)
}
#[cfg(test)]mod tests {use super::*;#[test]fn lock_excludes_parallel_library_owner_and_releases_on_drop(){let root=std::env::temp_dir().join(format!("leafloom-library-lock-{}",uuid::Uuid::new_v4()));std::fs::create_dir(&root).unwrap();std::fs::write(root.join(".leafloom-fixture"),"").unwrap();let first=acquire(&root).unwrap();assert_eq!(acquire(&root).unwrap_err(),"LIBRARY_BUSY");drop(first);drop(acquire(&root).unwrap());std::fs::remove_dir_all(root).unwrap();}}

#[cfg(all(test,unix))]mod symlink_tests{use super::*;#[test]fn lock_refuses_symlink_leaf_without_touching_target(){use std::os::unix::fs::symlink;let root=std::env::temp_dir().join(format!("leafloom-lock-link-{}",uuid::Uuid::new_v4()));std::fs::create_dir(&root).unwrap();let target=root.join("target");std::fs::write(&target,"preserve").unwrap();symlink(&target,root.join(".leafloom-host.lock")).unwrap();assert_eq!(acquire(&root).unwrap_err(),"LIBRARY_UNAVAILABLE");assert_eq!(std::fs::read_to_string(&target).unwrap(),"preserve");std::fs::remove_dir_all(root).unwrap();}}
