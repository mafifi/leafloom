use std::{fs::{self,OpenOptions},io::Write,path::{Path,PathBuf},time::{SystemTime,UNIX_EPOCH},sync::atomic::{AtomicU64,Ordering}};
static SERIAL:AtomicU64=AtomicU64::new(0);
#[derive(Debug,PartialEq,Eq)]
pub struct Selection {pub root:PathBuf,pub fallback_from:Option<PathBuf>}
fn writable(root:&Path)->bool {
 if fs::create_dir_all(root).is_err()||fs::symlink_metadata(root).is_ok_and(|meta|meta.file_type().is_symlink()){return false;}
 let stamp=SystemTime::now().duration_since(UNIX_EPOCH).map_or(0,|time|time.as_nanos());
 let path=root.join(format!(".leafloom-write-probe-{}-{stamp}-{}",std::process::id(),SERIAL.fetch_add(1,Ordering::Relaxed)));
 let Ok(mut file)=OpenOptions::new().write(true).create_new(true).open(&path) else{return false;};
 let result=file.write_all(b"writable").and_then(|_|file.sync_all());drop(file);
 let removed=fs::remove_file(&path);result.is_ok()&&removed.is_ok()
}
/** A remembered or existing library remains authoritative, even when temporarily unavailable. */
pub fn select(default:&Path,home:&Path,configured:Option<&Path>)->Selection {
 if let Some(root)=configured{return Selection{root:root.to_owned(),fallback_from:None};}
 if default.join("library.json").exists()||writable(default){return Selection{root:default.to_owned(),fallback_from:None};}
 let mut candidates=Vec::new();let documents=home.join("Documents");
 if documents.is_dir(){candidates.push(documents.join("Leafloom"));}
 candidates.push(home.join("Leafloom"));
 for root in candidates {if root!=default&&writable(&root){return Selection{root,fallback_from:Some(default.to_owned())};}}
 Selection{root:default.to_owned(),fallback_from:None}
}
#[cfg(test)]mod tests {
 use super::*;
 fn fixture()->PathBuf{let stamp=SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();let root=std::env::temp_dir().join(format!("leafloom-startup-library-{}-{stamp}-{}",std::process::id(),SERIAL.fetch_add(1,Ordering::Relaxed)));fs::create_dir(&root).unwrap();root}
 #[test]fn first_unwritable_documents_library_selects_a_writable_sibling_and_preserves_source(){let home=fixture();let documents=home.join("Documents");fs::write(&documents,b"private source").unwrap();let default=documents.join("Leafloom");let selected=select(&default,&home,None);assert_eq!(selected.root,home.join("Leafloom"));assert_eq!(selected.fallback_from,Some(default));assert_eq!(fs::read(documents).unwrap(),b"private source");assert_eq!(fs::read_dir(selected.root).unwrap().count(),0);fs::remove_dir_all(home).unwrap();}
 #[test]fn explicitly_chosen_destination_is_never_redirected(){let home=fixture();let chosen=home.join("Unavailable").join("Leafloom");fs::write(home.join("Unavailable"),b"preserve").unwrap();let selection=select(&home.join("Documents/Leafloom"),&home,Some(&chosen));assert_eq!(selection.root,chosen);assert_eq!(selection.fallback_from,None);assert!(!home.join("Leafloom").exists());fs::remove_dir_all(home).unwrap();}
 #[test]fn existing_manuscript_library_is_never_redirected_or_probed(){let home=fixture();let default=home.join("Documents/Leafloom");fs::create_dir_all(&default).unwrap();fs::write(default.join("library.json"),b"private writing").unwrap();assert_eq!(select(&default,&home,None),Selection{root:default.clone(),fallback_from:None});assert_eq!(fs::read(default.join("library.json")).unwrap(),b"private writing");assert_eq!(fs::read_dir(default).unwrap().count(),1);fs::remove_dir_all(home).unwrap();}
 #[test]fn writable_default_and_redirected_profile_keep_the_same_library_after_restart(){let home=fixture();let default=home.join("Documents/Leafloom");let selected=select(&default,&home,None);assert_eq!(selected.root,default);assert_eq!(selected.fallback_from,None);let redirected=home.join("Alternate");fs::create_dir(&redirected).unwrap();let after=select(&default,&home,Some(&redirected));assert_eq!(after.root,redirected);fs::remove_dir_all(home).unwrap();}
}
