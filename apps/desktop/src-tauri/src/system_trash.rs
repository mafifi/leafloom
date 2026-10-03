use std::path::{Path,PathBuf};
use serde_json::Value;

fn book_path(root:&Path,id:&str)->Result<PathBuf,String>{
    if id.is_empty()||id.len()>128||!id.as_bytes()[0].is_ascii_alphanumeric()||!id.bytes().all(|c|c.is_ascii_alphanumeric()||c==b'_'||c==b'-')||["Exports","Backups","Trash"].contains(&id){return Err("INVALID".into());}
    let path=root.join(id);
    let metadata=std::fs::symlink_metadata(&path).map_err(|_|"TRASH_UNAVAILABLE")?;
    if metadata.file_type().is_symlink()||!metadata.is_dir(){return Err("INVALID".into());}
    if path.canonicalize().map_err(|_|"TRASH_UNAVAILABLE")?.parent()!=Some(root.canonicalize().map_err(|_|"TRASH_UNAVAILABLE")?.as_path()){return Err("INVALID".into());}
    Ok(path)
}

pub fn move_book(root:&Path,id:&str,owner:&Value)->Result<Option<PathBuf>,String>{
    let path=book_path(root,id)?;
    let lock=path.join(".writer.lock");
    let metadata=std::fs::symlink_metadata(&lock).map_err(|_|"TRASH_UNAVAILABLE")?;
    if !metadata.is_file()||metadata.file_type().is_symlink(){return Err("TRASH_UNAVAILABLE".into());}
    let current:Value=serde_json::from_slice(&std::fs::read(&lock).map_err(|_|"TRASH_UNAVAILABLE")?).map_err(|_|"TRASH_UNAVAILABLE")?;
    if current.get("token")!=owner.get("lease")||current.get("pid")!=owner.get("ownerPid"){return Err("UNAUTHORIZED".into());}
    #[cfg(target_os="macos")]{
        use objc2_foundation::{NSFileManager,NSString,NSURL};
        let url=NSURL::fileURLWithPath_isDirectory(&NSString::from_str(path.to_str().ok_or("INVALID")?),true);
        let mut resulting=None;
        NSFileManager::defaultManager().trashItemAtURL_resultingItemURL_error(&url,Some(&mut resulting)).map_err(|_|"TRASH_UNAVAILABLE")?;
        // The OS returns the exact destination, including any collision suffix.
        // Remove only our moved lease, never an existing Trash item by guessed name.
        let destination=resulting.and_then(|url|url.path()).map(|s|PathBuf::from(s.to_string()));
        if let Some(destination)=destination.as_ref(){
            let moved=destination.join(".writer.lock");
            if std::fs::symlink_metadata(&moved).is_ok_and(|m|m.is_file()&&!m.file_type().is_symlink()){
                if std::fs::read(&moved).ok().and_then(|bytes|serde_json::from_slice::<Value>(&bytes).ok()).as_ref()==Some(&current){let _=std::fs::remove_file(moved);}
            }
        }
        Ok(destination)
    }
    #[cfg(not(target_os="macos"))]{
        // The application holds its exclusive library lock and host request mutex.
        // Avoid retaining an alive writer lock in a user-restored Recycle Bin item.
        std::fs::remove_file(&lock).map_err(|_|"TRASH_UNAVAILABLE")?;
        if trash::delete(&path).is_err(){
            use std::io::Write;
            if let Ok(mut file)=std::fs::OpenOptions::new().write(true).create_new(true).open(&lock){let _=file.write_all(current.to_string().as_bytes());let _=file.sync_all();}
            return Err("TRASH_UNAVAILABLE".into());
        }
        Ok(None)
    }
}

#[cfg(test)]mod tests{
    use super::*;
    #[test]fn rejects_reserved_and_unscoped_books(){
        let root=std::env::temp_dir().join(format!("leafloom-trash-scope-{}",uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();
        for id in ["Exports","Backups","Trash","../outside","/tmp","book/a",""]{assert!(book_path(&root,id).is_err());}
        std::fs::create_dir(root.join("book-owned")).unwrap();
        assert_eq!(book_path(&root,"book-owned").unwrap(),root.join("book-owned"));
        std::fs::remove_dir_all(root).unwrap();
    }
    #[cfg(target_os="macos")]
    #[test]fn actual_system_trash_moves_only_private_fixture_and_clears_owned_lease(){
        if std::env::var("LEAFLOOM_TEST_SYSTEM_TRASH").as_deref()!=Ok("1"){return;}
        let root=std::env::temp_dir().join(format!("leafloom-trash-fixture-{}",uuid::Uuid::new_v4()));
        std::fs::create_dir(&root).unwrap();std::fs::write(root.join(".leafloom-fixture"),b"").unwrap();
        let id=format!("leafloom-test-{}",uuid::Uuid::new_v4());let book=root.join(&id);std::fs::create_dir(&book).unwrap();
        let token=uuid::Uuid::new_v4().to_string();let pid=std::process::id();
        std::fs::write(book.join(".writer.lock"),serde_json::json!({"pid":pid,"token":token}).to_string()).unwrap();
        std::fs::write(book.join("fixture.txt"),b"private recoverable fixture").unwrap();
        assert!(move_book(&root,&id,&serde_json::json!({"lease":uuid::Uuid::new_v4(),"ownerPid":pid})).is_err());
        assert_eq!(std::fs::read(book.join("fixture.txt")).unwrap(),b"private recoverable fixture");
        let destination=move_book(&root,&id,&serde_json::json!({"lease":token,"ownerPid":pid})).unwrap().unwrap();
        assert!(!book.exists());assert_eq!(std::fs::read(destination.join("fixture.txt")).unwrap(),b"private recoverable fixture");
        assert!(!destination.join(".writer.lock").exists());
        // Cleanup uses only the exact destination returned by NSFileManager.
        std::fs::remove_dir_all(destination).unwrap();std::fs::remove_dir_all(root).unwrap();
    }

}
