use std::{cell::{Cell,RefCell},collections::HashSet};
use objc2::{rc::Retained,runtime::ProtocolObject};
use objc2_foundation::{MainThreadMarker,NSNotificationCenter,NSOperationQueue,NSObjectProtocol};
use objc2_app_kit::{NSApplication,NSMenu,NSMenuDidAddItemNotification,NSMenuDidChangeItemNotification,NSMenuDidBeginTrackingNotification};
thread_local! {
 static OWNED:RefCell<(String,HashSet<String>)>=RefCell::new((String::new(),HashSet::new()));
 static HIDING:Cell<bool>=const{Cell::new(false)};
 static WATCHERS:RefCell<Vec<Retained<ProtocolObject<dyn NSObjectProtocol>>>>=const{RefCell::new(Vec::new())};
}
fn current(mtm:MainThreadMarker)->Option<Retained<NSMenu>> {
 let title=OWNED.with(|owned|owned.borrow().0.clone());
 let bar=NSApplication::sharedApplication(mtm).mainMenu()?;
 bar.itemArray().iter().filter_map(|item|item.submenu()).find(|menu|menu.title().to_string()==title)
}
pub fn stop(){
 let center=NSNotificationCenter::defaultCenter();
 WATCHERS.with(|watchers|{for token in watchers.borrow_mut().drain(..){unsafe{center.removeObserver(AsRef::<objc2::runtime::AnyObject>::as_ref(&*token));}}});
}
pub fn filter(mtm:MainThreadMarker) {
 if HIDING.with(|hiding|hiding.replace(true)){return;}
 if let Some(menu)=current(mtm){
  let owned=OWNED.with(|owned|owned.borrow().1.clone());
  // Retain the live menu and its item array for this pass only. Never cache
  // an NSMenu pointer across a Tauri menu rebuild or language change.
  for item in menu.itemArray().iter(){
   if item.isSeparatorItem(){continue;}
   let action=item.action().map(|action|action.name().to_string_lossy().into_owned());
   let native=action.as_deref().is_some_and(|action|["fireMenuItemAction:","undo:","redo:","cut:","copy:","paste:","pasteAndMatchStyle:","selectAll:"].contains(&action));
   if !native&&!owned.contains(&item.title().to_string())&&!item.isHidden(){item.setHidden(true);}
  }
 }
 HIDING.with(|hiding|hiding.set(false));
}
pub fn configure(title:String,labels:Vec<String>,mtm:MainThreadMarker) {
 OWNED.with(|owned|*owned.borrow_mut()=(title,labels.into_iter().collect()));
 WATCHERS.with(|watchers| {
  if !watchers.borrow().is_empty(){return;}
  let center=NSNotificationCenter::defaultCenter();
  // AppKit notifications may be recursive when setHidden changes an item.
  // The guard above keeps those callbacks bounded. Main queue serializes UI.
  for name in unsafe{[NSMenuDidAddItemNotification,NSMenuDidChangeItemNotification,NSMenuDidBeginTrackingNotification]} {
   let callback=block2::RcBlock::new(|_|{if let Some(mtm)=MainThreadMarker::new(){filter(mtm);}});
   let token=unsafe{center.addObserverForName_object_queue_usingBlock(Some(name),None,Some(&NSOperationQueue::mainQueue()),&callback)};
   watchers.borrow_mut().push(token);
  }
 });
 filter(mtm);
}
#[cfg(all(feature="native-test",debug_assertions))]
pub fn probe(mtm:MainThreadMarker)->Result<serde_json::Value,&'static str>{
 use objc2::MainThreadOnly;
 use objc2_foundation::NSString;
 let menu=current(mtm).ok_or("MENU_UNAVAILABLE")?;
 let foreign=unsafe{objc2_app_kit::NSMenuItem::initWithTitle_action_keyEquivalent(objc2_app_kit::NSMenuItem::alloc(mtm),&NSString::from_str("Leafloom fixture foreign item"),Some(objc2::sel!(leafloomFixtureForeignAction:)),&NSString::from_str(""))};
 menu.addItem(&foreign);
 let foreign_hidden=foreign.isHidden();
 let copy_visible=menu.itemArray().iter().any(|item|item.action().is_some_and(|action|action.name().to_bytes()==b"copy:")&&!item.isHidden());
 let own_visible=menu.itemArray().iter().any(|item|item.action().is_some_and(|action|action.name().to_bytes()==b"fireMenuItemAction:")&&!item.isHidden());
 menu.removeItem(&foreign);
 Ok(serde_json::json!({"foreignHidden":foreign_hidden,"copyVisible":copy_visible,"ownedVisible":own_visible}))
}
