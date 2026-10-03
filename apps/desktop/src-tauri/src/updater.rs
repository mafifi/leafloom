use serde_json::{json,Value};
use std::{path::{Path,PathBuf},sync::{Mutex,atomic::{AtomicBool,Ordering}},time::Duration};
use tauri::Emitter;
use tauri_plugin_updater::{UpdaterExt,Update};

struct Pending {update:Update,bytes:Vec<u8>}
struct State {status:Value,pending:Option<Pending>}
pub struct Service {state:Mutex<State>,checking:AtomicBool,fixture:Option<Fixture>}
#[derive(Clone,serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct Fixture {endpoint:String,pubkey:String,executable:PathBuf}
fn base(status:&str,enabled:bool)->Value {json!({"version":env!("CARGO_PKG_VERSION"),"channel":if enabled {"signed"}else{"manual"},"status":status})}
fn disabled()->Value {let mut value=base("disabled",false);value["reason"]=json!("release-channel-unconfigured");value}
fn validate_fixture(root:&Path,value:Fixture)->Result<Fixture,String>{
 let root=root.canonicalize().map_err(|_|"INVALID_UPDATE_FIXTURE")?;
 if !root.join(".leafloom-fixture").is_file(){return Err("INVALID_UPDATE_FIXTURE".into());}
 let url=tauri::Url::parse(&value.endpoint).map_err(|_|"INVALID_UPDATE_FIXTURE")?;
 if url.scheme()!="http" || !matches!(url.host_str(),Some("127.0.0.1")|Some("localhost")) || url.port().is_none() || !url.username().is_empty() || url.password().is_some(){return Err("INVALID_UPDATE_FIXTURE".into());}
 let executable=value.executable.canonicalize().map_err(|_|"INVALID_UPDATE_FIXTURE")?;
 if !executable.starts_with(&root)||!executable.is_file()||value.pubkey.is_empty()||value.pubkey.len()>8192{return Err("INVALID_UPDATE_FIXTURE".into());}
 #[cfg(target_os="macos")]
 {let bundle=tauri_plugin_updater::extract_path_from_executable(&executable).map_err(|_|"INVALID_UPDATE_FIXTURE")?;if !bundle.starts_with(&root)||bundle.extension().is_none_or(|ext|ext!="app"){return Err("INVALID_UPDATE_FIXTURE".into());}}
 Ok(Fixture{executable,..value})
}
fn fixture(root:&Path)->Result<Option<Fixture>,String>{
 #[cfg(all(feature="native-test",debug_assertions))]
 {let name=root.join(".leafloom-updater.json");if name.is_file(){let bytes=std::fs::read(name).map_err(|_|"INVALID_UPDATE_FIXTURE")?;if bytes.len()>16384{return Err("INVALID_UPDATE_FIXTURE".into());}return validate_fixture(root,serde_json::from_slice(&bytes).map_err(|_|"INVALID_UPDATE_FIXTURE")?).map(Some);}}
 let _=root;Ok(None)
}
/// Only marked debug fixtures can inject a loopback channel or alternate disposable bundle.
pub fn configured(config:Option<&Value>)->bool {config.is_some_and(|value|value.get("pubkey").and_then(Value::as_str).is_some_and(|key|!key.is_empty())&&value.get("endpoints").and_then(Value::as_array).is_some_and(|v|!v.is_empty()))}
pub fn configure(context:&mut tauri::Context<tauri::Wry>)->Result<bool,String>{
 #[cfg(all(feature="native-test",debug_assertions))]
 if let Some(root)=std::env::var_os("LEAFLOOM_FIXTURE_ROOT") {
  if let Some(value)=fixture(Path::new(&root))? {context.config_mut().plugins.0.insert("updater".into(),json!({"pubkey":value.pubkey,"endpoints":[value.endpoint],"dangerousInsecureTransportProtocol":true}));}
 }
 Ok(configured(context.config().plugins.0.get("updater")))
}
impl Service {
 pub fn new(root:&Path,enabled:bool)->Result<Self,String>{Ok(Self{state:Mutex::new(State{status:if enabled {base("idle",true)}else{disabled()},pending:None}),checking:AtomicBool::new(false),fixture:fixture(root)?})}
 pub fn status(&self)->Value{self.state.lock().map(|v|v.status.clone()).unwrap_or_else(|_|json!({"version":env!("CARGO_PKG_VERSION"),"channel":"signed","status":"error","code":"UPDATE_UNAVAILABLE"}))}
 fn publish(&self,app:&tauri::AppHandle,value:Value){if let Ok(mut state)=self.state.lock(){state.status=value.clone();}let _=app.emit("leafloom:update",value);}
 fn failure(&self,app:&tauri::AppHandle,code:&str){eprintln!("{{\"event\":\"update.failure\",\"code\":\"{code}\"}}");if self.state.lock().is_ok_and(|v|v.pending.is_some()){return;}let mut value=base("error",true);value["code"]=json!(code);self.publish(app,value);}
 pub async fn check(&self,app:&tauri::AppHandle)->Value{
  let current=self.status();if current["status"]=="disabled"||current["status"]=="ready"||current["status"]=="installing"||self.checking.swap(true,Ordering::SeqCst){return current;}
  self.publish(app,base("checking",true));
  let result=self.download(app).await;
  if let Err(code)=result{self.failure(app,code);}
  self.checking.store(false,Ordering::SeqCst);self.status()
 }
 async fn download(&self,app:&tauri::AppHandle)->Result<(),&'static str>{
  let mut builder=app.updater_builder().timeout(Duration::from_secs(30));
  if let Some(value)=&self.fixture{builder=builder.executable_path(&value.executable).no_proxy();}
  let updater=builder.build().map_err(|_|"UPDATE_UNAVAILABLE")?;
  let Some(update)=updater.check().await.map_err(|_|"UPDATE_NETWORK")? else {self.publish(app,base("idle",true));return Ok(());};
  if let Some(value)=&self.fixture{let endpoint=tauri::Url::parse(&value.endpoint).map_err(|_|"UPDATE_UNAVAILABLE")?;if update.download_url.scheme()!=endpoint.scheme()||update.download_url.host_str()!=endpoint.host_str()||update.download_url.port()!=endpoint.port(){return Err("UPDATE_PACKAGE");}}
  let version=update.version.clone();let mut transferred=0u64;
  let bytes=update.download(|chunk,total|{transferred=transferred.saturating_add(chunk as u64);let mut status=base("downloading",true);status["latestVersion"]=json!(version);status["transferred"]=json!(transferred);status["percent"]=json!(total.filter(|v|*v>0).map(|v|((transferred as f64)/(v as f64)*100.).clamp(0.,100.)).unwrap_or(0.));if let Some(total)=total.filter(|v|*v>0){status["total"]=json!(total);}self.publish(app,status);},||{}).await.map_err(|error|match error{tauri_plugin_updater::Error::Minisign(_)|tauri_plugin_updater::Error::Base64(_)|tauri_plugin_updater::Error::SignatureUtf8(_)=>"UPDATE_SIGNATURE",_=>"UPDATE_NETWORK"})?;
  {let mut state=self.state.lock().map_err(|_|"UPDATE_UNAVAILABLE")?;state.pending=Some(Pending{update,bytes});}
  let mut status=base("ready",true);status["latestVersion"]=json!(version);self.publish(app,status);Ok(())
 }
 /// Caller must independently establish that no writing leases remain open.
 pub fn install(&self,app:&tauri::AppHandle,open_books:u64)->Result<bool,String>{
  if open_books!=0{return Err("BUSY".into());}
  let mut state=self.state.lock().map_err(|_|"UPDATE_UNAVAILABLE")?;
  let Some(pending)=state.pending.as_ref() else{return Ok(false);};
  let mut status=base("installing",true);status["latestVersion"]=json!(pending.update.version);let _=app.emit("leafloom:update",status);
  if pending.update.install(&pending.bytes).is_err(){eprintln!("{{\"event\":\"update.failure\",\"code\":\"UPDATE_INSTALL\"}}");let _=app.emit("leafloom:update",state.status.clone());return Err("UPDATE_INSTALL".into());}
  state.pending=None;state.status=base("idle",true);Ok(true)
 }
}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn wake_filters_only_actual_resume(){assert!(windows_resume(18));for event in [4,7,0,u32::MAX]{assert!(!windows_resume(event));}assert!(linux_resume("PrepareForSleep",Some(false)));assert!(!linux_resume("PrepareForSleep",Some(true)));assert!(!linux_resume("PrepareForSleep",None));assert!(!linux_resume("Other",Some(false)));}
 #[test]fn wake_rejects_stopped_and_previous_connection_callbacks(){assert!(wake_current(true,2,2));assert!(!wake_current(false,2,2));assert!(!wake_current(true,3,2));}
 #[test]fn empty_configuration_stays_disabled(){assert!(!configured(None));assert!(!configured(Some(&json!({"pubkey":"","endpoints":[]}))));}
 #[test]fn unconfigured_service_never_claims_installable_update(){let s=Service::new(Path::new("."),false).unwrap();assert_eq!(s.status(),disabled());assert!(s.state.lock().unwrap().pending.is_none());}
 #[test]fn fixture_rejects_remote_endpoint_and_missing_bundle(){let root=std::env::temp_dir().join(format!("leafloom-updater-{}",uuid::Uuid::new_v4()));std::fs::create_dir_all(&root).unwrap();std::fs::write(root.join(".leafloom-fixture"),"").unwrap();let value=Fixture{endpoint:"https://example.com/update".into(),pubkey:"fixture".into(),executable:root.join("missing")};assert!(validate_fixture(&root,value).is_err());std::fs::remove_dir_all(root).unwrap();}
}

#[cfg(target_os="macos")]
mod wake {
 use std::cell::RefCell;
 use objc2::{rc::Retained,runtime::ProtocolObject};
 use objc2_foundation::{NSObjectProtocol,NSOperationQueue};
 use objc2_app_kit::{NSWorkspace,NSWorkspaceDidWakeNotification};
 use tauri::Emitter;
 thread_local! {static OBSERVER:RefCell<Option<Retained<ProtocolObject<dyn NSObjectProtocol>>>>=const{RefCell::new(None)};}
 pub fn start(app:tauri::AppHandle){stop();let center=NSWorkspace::sharedWorkspace().notificationCenter();let callback=block2::RcBlock::new(move |_|{let _=app.emit("leafloom:update-wake",());});let token=unsafe{center.addObserverForName_object_queue_usingBlock(Some(NSWorkspaceDidWakeNotification),None,Some(&NSOperationQueue::mainQueue()),&callback)};OBSERVER.with(|value|*value.borrow_mut()=Some(token));}
 pub fn stop(){OBSERVER.with(|value|{if let Some(token)=value.borrow_mut().take(){let center=NSWorkspace::sharedWorkspace().notificationCenter();unsafe{center.removeObserver(AsRef::<objc2::runtime::AnyObject>::as_ref(&*token));}}});}
}
// Shared exact OS-event predicates keep suspend and interactive-resume duplicates out.
#[cfg(any(target_os="windows",test))]
fn windows_resume(event:u32)->bool {event==18}
#[cfg(any(target_os="linux",test))]
fn linux_resume(member:&str,sleeping:Option<bool>)->bool {member=="PrepareForSleep"&&sleeping==Some(false)}
#[cfg(any(target_os="linux",test))]
fn wake_current(active:bool,current:u64,observed:u64)->bool {active&&current==observed}
#[cfg(any(target_os="windows",target_os="linux"))]
fn wake_unavailable(){eprintln!("{{\"event\":\"update.wake-unavailable\",\"code\":\"UPDATE_WAKE_UNAVAILABLE\"}}");}

#[cfg(target_os="windows")]
mod platform_wake {
 use super::*;
 use std::sync::OnceLock;
 use windows_sys::Win32::{System::Power::{PowerRegisterSuspendResumeNotification,PowerUnregisterSuspendResumeNotification,DEVICE_NOTIFY_SUBSCRIBE_PARAMETERS},UI::WindowsAndMessaging::DEVICE_NOTIFY_CALLBACK};
 // Process-lifetime context: even an already-running OS callback cannot dereference freed data.
 struct Observer {app:Option<tauri::AppHandle>,registration:usize}
 static OBSERVER:OnceLock<Mutex<Observer>>=OnceLock::new();
 fn observer()->&'static Mutex<Observer>{OBSERVER.get_or_init(||Mutex::new(Observer{app:None,registration:0}))}
 unsafe extern "system" fn callback(_: *const std::ffi::c_void,event:u32,_: *const std::ffi::c_void)->u32 {
  let _=std::panic::catch_unwind(||{if windows_resume(event){if let Ok(state)=observer().lock(){if let Some(app)=&state.app{let _=app.emit("leafloom:update-wake",());}}}});0
 }
 pub fn start(app:tauri::AppHandle){
  stop();if let Ok(mut state)=observer().lock(){state.app=Some(app);}
  let params=DEVICE_NOTIFY_SUBSCRIBE_PARAMETERS{Callback:Some(callback),Context:std::ptr::null_mut()};let mut handle=std::ptr::null_mut();
  let result=unsafe{PowerRegisterSuspendResumeNotification(DEVICE_NOTIFY_CALLBACK,(&params as *const DEVICE_NOTIFY_SUBSCRIBE_PARAMETERS).cast_mut().cast(),&mut handle)};
  if result!=0{if let Ok(mut state)=observer().lock(){state.app=None;}wake_unavailable();return;}
  if let Ok(mut state)=observer().lock(){state.registration=handle as usize;}
 }
 pub fn stop(){
  let registration=observer().lock().map(|mut state|{state.app=None;std::mem::take(&mut state.registration)}).unwrap_or(0);
  // Never hold the callback mutex while unregister waits on the OS.
  if registration!=0&&unsafe{PowerUnregisterSuspendResumeNotification(registration as isize)}!=0{wake_unavailable();}
 }
}

#[cfg(target_os="linux")]
mod platform_wake {
 use super::*;
 use std::{cell::RefCell,rc::{Rc,Weak},sync::{Arc,atomic::AtomicU64}};
 use gio::{glib,prelude::*};
 struct Observer {app:tauri::AppHandle,active:Arc<AtomicBool>,generation:Arc<AtomicU64>,cancel:gio::Cancellable,connection:Option<gio::DBusConnection>,proxy:Option<gio::DBusProxy>,signal:Option<glib::SignalHandlerId>,closed:Option<glib::SignalHandlerId>,retry:Option<glib::SourceId>}
 thread_local!{static OBSERVER:RefCell<Option<Rc<RefCell<Observer>>>>=const{RefCell::new(None)};}
 fn active(state:&Weak<RefCell<Observer>>)->Option<Rc<RefCell<Observer>>>{state.upgrade().filter(|s|s.borrow().active.load(Ordering::SeqCst))}
 fn disconnect(state:&mut Observer){
  if let Some(proxy)=state.proxy.take(){if let Some(id)=state.signal.take(){proxy.disconnect(id);}}
  if let Some(connection)=state.connection.take(){if let Some(id)=state.closed.take(){connection.disconnect(id);}}
 }
 fn retry(state:&Rc<RefCell<Observer>>){
  wake_unavailable();let mut value=state.borrow_mut();if !value.active.load(Ordering::SeqCst)||value.retry.is_some(){return;}
  let weak=Rc::downgrade(state);value.retry=Some(glib::timeout_add_local_once(Duration::from_secs(30),move||{if let Some(state)=active(&weak){state.borrow_mut().retry=None;connect(&state);}}));
 }
 fn connect(state:&Rc<RefCell<Observer>>){
  let generation=state.borrow().generation.fetch_add(1,Ordering::SeqCst).wrapping_add(1);
  let weak=Rc::downgrade(state);let cancel=state.borrow().cancel.clone();
  gio::bus_get(gio::BusType::System,Some(&cancel),move|result|{
   let Some(state)=active(&weak).filter(|s|s.borrow().generation.load(Ordering::SeqCst)==generation)else{return;};let connection=match result{Ok(value)=>value,Err(_)=>{retry(&state);return;}};
   // Loss of the system bus must not terminate a writing application.
   connection.set_exit_on_close(false);
   let weak_closed=Rc::downgrade(&state);
   let closed=connection.connect_local("closed",false,move |_|{if let Some(state)=active(&weak_closed).filter(|s|s.borrow().generation.load(Ordering::SeqCst)==generation){{let mut value=state.borrow_mut();value.generation.fetch_add(1,Ordering::SeqCst);disconnect(&mut value);}retry(&state);}None});
   {let mut value=state.borrow_mut();value.connection=Some(connection.clone());value.closed=Some(closed);}
   let cancel=state.borrow().cancel.clone();let weak=Rc::downgrade(&state);
   gio::DBusProxy::new(&connection,gio::DBusProxyFlags::DO_NOT_LOAD_PROPERTIES|gio::DBusProxyFlags::DO_NOT_AUTO_START,None,Some("org.freedesktop.login1"),"/org/freedesktop/login1","org.freedesktop.login1.Manager",Some(&cancel),move|result|{
    let Some(state)=active(&weak).filter(|s|s.borrow().generation.load(Ordering::SeqCst)==generation)else{return;};let proxy=match result{Ok(value)=>value,Err(_)=>{disconnect(&mut state.borrow_mut());retry(&state);return;}};
    let (app,live,epoch)={let value=state.borrow();(value.app.clone(),Arc::downgrade(&value.active),Arc::downgrade(&value.generation))};
    // GDBusProxy tracks service owner changes; reject queued signals from a previous owner.
    let signal=proxy.connect_g_signal(move|proxy,sender,member,parameters|{if live.upgrade().zip(epoch.upgrade()).is_some_and(|(live,epoch)|wake_current(live.load(Ordering::SeqCst),epoch.load(Ordering::SeqCst),generation))&&sender.is_some()&&proxy.name_owner().as_deref()==sender&&linux_resume(member,parameters.get::<(bool,)>().map(|v|v.0)){let _=app.emit("leafloom:update-wake",());}});
    if proxy.name_owner().is_none(){wake_unavailable();}
    let mut value=state.borrow_mut();value.signal=Some(signal);value.proxy=Some(proxy);
   });
  });
 }
 pub fn start(app:tauri::AppHandle){stop();let state=Rc::new(RefCell::new(Observer{app,active:Arc::new(AtomicBool::new(true)),generation:Arc::new(AtomicU64::new(0)),cancel:gio::Cancellable::new(),connection:None,proxy:None,signal:None,closed:None,retry:None}));OBSERVER.with(|v|*v.borrow_mut()=Some(state.clone()));connect(&state);}
 pub fn stop(){OBSERVER.with(|v|{if let Some(state)=v.borrow_mut().take(){let mut value=state.borrow_mut();value.active.store(false,Ordering::SeqCst);value.cancel.cancel();if let Some(source)=value.retry.take(){source.remove();}disconnect(&mut value);}});}
}
pub fn start_wake(app:tauri::AppHandle){#[cfg(target_os="macos")]wake::start(app);#[cfg(any(target_os="windows",target_os="linux"))]platform_wake::start(app);#[cfg(not(any(target_os="macos",target_os="windows",target_os="linux")))]let _=app;}
pub fn stop_wake(){#[cfg(target_os="macos")]wake::stop();#[cfg(any(target_os="windows",target_os="linux"))]platform_wake::stop();}
