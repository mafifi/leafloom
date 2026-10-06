mod os_services;
use os_services::os_request;
#[cfg(any(not(target_os = "macos"), test))]
mod system_languages;
mod external_drop;
mod updater;
mod native_menu;
mod fullscreen_menu;
#[cfg(target_os="macos")]mod edit_menu;
mod preferences;
mod startup_diagnostics;
mod startup_library;
static STARTUP_PROFILE: std::sync::OnceLock<Option<PathBuf>> = std::sync::OnceLock::new();
mod secrets;
mod library_lock;
mod system_trash;
mod image_codec;
mod print_document;
#[cfg(all(feature="native-test",debug_assertions))]
mod fixture_dialogs;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{channel, Receiver},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{Emitter, Manager};

struct Host {
    child: Arc<Mutex<Child>>,
    input: ChildStdin,
    output: Receiver<String>,
    sequence: u64,
    failed: Arc<AtomicBool>,
    stopping: Arc<AtomicBool>,
    app: tauri::AppHandle,
    art_worker: bool,
}
impl Host {
    fn fail(&self,code:&str){if !self.failed.swap(true,Ordering::SeqCst)&&!self.art_worker{emit_host_failure(&self.app,code);}}
    fn stop(&mut self) {
        self.stopping.store(true,Ordering::SeqCst);
        let _ = self.input.flush();
        if let Ok(mut child) = self.child.lock() { let _ = child.kill(); let _ = child.wait(); }
    }
    fn request(
        &mut self,
        method: String,
        payload: Value,
        traceparent: Option<String>,
    ) -> Result<Value, String> {
        if self.failed.load(Ordering::SeqCst) {
            return Err("HOST_UNAVAILABLE".into());
        }
        self.sequence += 1;
        let id = self.sequence;
        let result = (|| {
            let request =
                json!({"id":id,"method":method,"payload":payload,"traceparent":traceparent});
            writeln!(self.input, "{}", request).map_err(|_| "HOST_UNAVAILABLE")?;
            self.input.flush().map_err(|_| "HOST_UNAVAILABLE")?;
            let line = self
                .output
                .recv_timeout(Duration::from_secs(if method == "_paintCover" {300} else {60}))
                .map_err(|_| "HOST_UNAVAILABLE")?;
            let response: Value = serde_json::from_str(&line).map_err(|_| "HOST_PROTOCOL")?;
            if response.get("id").and_then(Value::as_u64) != Some(id) {
                return Err("HOST_PROTOCOL");
            }
            Ok(response)
        })();
        if result.is_err() {
            self.fail(result.as_ref().err().copied().unwrap_or("HOST_UNAVAILABLE"));
            self.stop();
        }
        result.map_err(String::from)
    }
}
impl Drop for Host {fn drop(&mut self){self.stop();}}
struct State {
    host: Arc<Mutex<Host>>,
    resources: PathBuf,
    _library_lock: std::fs::File,
    secrets: Arc<secrets::Secrets>,
    jobs: Arc<Mutex<HashMap<String,Value>>>,
    workers: Arc<Mutex<HashMap<String,Arc<Mutex<Child>>>>>,
    grants: Mutex<HashSet<PathBuf>>,
    closing: AtomicBool,
    quitting: AtomicBool,
    update_restart: AtomicBool,
    root: PathBuf,
    languages: Vec<(String, String)>,
    default_root: PathBuf,
    library_fallback: Mutex<Option<PathBuf>>,
    profile_path: PathBuf,
    profile: Mutex<Value>,
    window_bounds: Mutex<Value>,
    fullscreen: AtomicBool,
    #[cfg(not(target_os = "macos"))]
    clipboard: Arc<Mutex<Option<arboard::Clipboard>>>,
}

#[tauri::command]
async fn host_request(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, State>,
    method: String,
    payload: Value,
    traceparent: Option<String>,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("UNAUTHORIZED".into());
    }
    let methods = [
        "reportRuntimeError",
        "renderEmailDraft",
        "manuscriptFingerprint",
        "runtimeState",
        "libraryPath",
        "createBackup",
        "listBackups",
        "readLibrary",
        "writeLibrary",
        "createBook",
        "listBooks",
        "readBookMeta",
        "readCoverArt",
        "readCoverArtJob",
        "writeBookMeta",
        "deleteBook",
        "openBook",
        "checkpoint",
        "closeBook",
        "importLegacy",
        "importManuscript",
        "exportBook",
        "exportChapter",
        "renderChapterPreview",
        "exportCollection",
        "renderPreview",
        "exportLegacy",
        "setCover",
        "removeCover",
        "readCover",
        "saveExport",
        "spellcheck",
        "spellSuggest",
        "spellLearn",
        "getSettings",
        "listLanguages",
        "getLanguage",
        "setLanguage",
        "consumeDocumentChanges",
        "writeSettings",
        "diagnostics",
    ];
    if !methods.contains(&method.as_str()) {
        return Ok(json!({"ok":false,"code":"INVALID"}));
    }
    let path_key = match method.as_str() {
        "importLegacy" | "importManuscript" | "setCover" => Some("source"),
        "exportLegacy" | "exportBook" | "exportChapter" | "exportCollection" | "saveExport" => Some("destination"),
        _ => None,
    };
    if let Some(key) = path_key {
        let path = payload
            .get(key)
            .and_then(Value::as_str)
            .map(PathBuf::from)
            .ok_or("INVALID")?;
        if !state
            .grants
            .lock()
            .map_err(|_| "HOST_UNAVAILABLE")?
            .contains(&path)
        {
            return Ok(json!({"ok":false,"code":"UNAUTHORIZED"}));
        }
    }
    let host = state.host.clone();
    let locale_changed = method == "setLanguage";
    let root=state.root.clone();
    let response = tauri::async_runtime::spawn_blocking(move || {
        let mut host=host.lock().map_err(|_| "HOST_UNAVAILABLE".to_string())?;
        if method=="deleteBook" {
            let prepared=host.request("_prepareDeleteBook".into(),payload.clone(),traceparent)?;
            if prepared.get("ok").and_then(Value::as_bool)!=Some(true){return Ok(prepared);}
            let owner=prepared.get("value").ok_or("HOST_PROTOCOL")?;
            let book_id=owner.get("bookId").and_then(Value::as_str).ok_or("HOST_PROTOCOL")?;
            let completion=json!({"bookId":book_id,"lease":owner.get("lease")});
            match system_trash::move_book(&root,book_id,owner){
                Ok(_)=>host.request("_finishDeleteBook".into(),completion,None),
                Err(code)=>{let _=host.request("_cancelDeleteBook".into(),completion,None);Ok(json!({"ok":false,"code":code}))}
            }
        }else{host.request(method,payload,traceparent)}
    })
    .await
    .map_err(|_| "HOST_UNAVAILABLE".to_string())??;
    if locale_changed && response.get("ok").and_then(Value::as_bool) == Some(true) {
        let dictionary = response
            .get("value")
            .and_then(|value| value.get("dict"))
            .and_then(Value::as_object);
        native_menu::install(window.app_handle(), dictionary, &state.languages)
            .map_err(|_| "OS_UNAVAILABLE")?;
        if let Some(locale) = response.pointer("/value/locale").and_then(Value::as_str) {
            native_menu::set_state(window.app_handle(), &json!({"language":locale}))
                .map_err(|_| "OS_UNAVAILABLE")?;
        }
    }
    Ok(response)
}

#[tauri::command]
async fn finish_close(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, State>,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("UNAUTHORIZED".into());
    }
    let host=state.host.clone();let response=tauri::async_runtime::spawn_blocking(move||host.lock().map_err(|_|"HOST_UNAVAILABLE")?.request("runtimeState".into(),json!({}),None)).await.map_err(|_|"HOST_UNAVAILABLE")??;
    if response.pointer("/value/openBooks").and_then(Value::as_u64)!=Some(0){return Err("BUSY".into());}
    if cfg!(target_os="macos")&&!state.quitting.load(Ordering::SeqCst){window.hide().map_err(|_|"OS_UNAVAILABLE")?;return Ok(());}
    let installed=if state.quitting.load(Ordering::SeqCst){app.state::<updater::Service>().install(&app,0)?}else{false};
    state.closing.store(true, Ordering::SeqCst);
    if installed&&state.update_restart.load(Ordering::SeqCst){app.request_restart();}else{app.exit(0);}
    Ok(())
}

fn emit_host_failure(app:&tauri::AppHandle,code:&str){if app.try_state::<State>().is_some_and(|state|!state.closing.load(Ordering::SeqCst)){let _=app.emit("leafloom:host-failed",json!({"code":if code=="HOST_PROTOCOL"{"HOST_PROTOCOL"}else{"HOST_UNAVAILABLE"},"canRestart":true}));}}
fn cover_book_id(payload:&Value)->Result<&str,String> {let id=payload.get("bookId").and_then(Value::as_str).ok_or("INVALID")?; if id.is_empty()||id.len()>128||!id.chars().all(|c|c.is_ascii_alphanumeric()||"_-".contains(c)){return Err("INVALID".into());}Ok(id)}
fn stop_workers(state:&State) {if let Ok(active)=state.workers.lock(){for child in active.values(){if let Ok(mut child)=child.lock(){let _=child.kill();let _=child.wait();}}}}
fn spawn_host(
    resources: PathBuf,
    root: PathBuf,
    app: tauri::AppHandle,
    art_worker: bool,
) -> Result<Host, Box<dyn std::error::Error>> {
    #[cfg(not(debug_assertions))]
    let directory = resources.join("host");
    #[cfg(debug_assertions)]
    let _ = resources;
    #[cfg(debug_assertions)]
    let directory = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries/host");
    let mut command = Command::new(directory.join(if cfg!(target_os = "windows") {
        "node.exe"
    } else {
        "node"
    }));
    command.arg(directory.join("main.mjs"))
    .env_remove("NODE_OPTIONS")
    .env_remove("NODE_PATH")
    .env_remove("NODE_REPL_EXTERNAL_MODULE")
    .env("NODE_ENV", "production")
    .env("LEAFLOOM_LIBRARY_ROOT", root)
    .env("LEAFLOOM_IMAGE_DECODER",std::env::current_exe()?)
    .env("LEAFLOOM_ART_WORKER", if art_worker {"1"} else {"0"})
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::inherit());
    #[cfg(target_os="macos")]
    if let Some(country)=objc2_foundation::NSLocale::currentLocale().regionCode(){command.env("LEAFLOOM_OS_COUNTRY",country.to_string());}else{command.env_remove("LEAFLOOM_OS_COUNTRY");}
    #[cfg(not(target_os="macos"))]
    command.env_remove("LEAFLOOM_OS_COUNTRY");
    #[cfg(not(debug_assertions))]
    command.env_remove("LEAFLOOM_ART_FIXTURE_BASE");
    let mut child = command.spawn()?;
    let input = child.stdin.take().ok_or("Missing host input")?;
    let stdout = child.stdout.take().ok_or("Missing host output")?;
    let (sender, output) = channel();
    let failed=Arc::new(AtomicBool::new(false));let stopping=Arc::new(AtomicBool::new(false));let reader_failed=failed.clone();let reader_stopping=stopping.clone();let host_app=app.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            match line {
                Ok(line) => {
                    if let Ok(frame) = serde_json::from_str::<Value>(&line) {
                        if frame.get("event").and_then(Value::as_str) == Some("cover-art-progress") && art_worker {
                            if let Some(payload) = frame.get("payload") {
                                if let (Some(book),Some(job),Some(status))=(payload.get("bookId").and_then(Value::as_str),payload.get("jobId").and_then(Value::as_str),payload.get("status").and_then(Value::as_str)) {
                                    if ["brief","painting","saving"].contains(&status) {
                                        if let Some(state)=app.try_state::<State>() { if let Ok(mut jobs)=state.jobs.lock() { if jobs.get(book).and_then(|v|v.get("jobId")).and_then(Value::as_str)==Some(job) { jobs.insert(book.into(),payload.clone()); let _=app.emit("leafloom:cover-art-progress",payload); } } }
                                    }
                                }
                            }
                            continue;
                        }
                        if frame.get("event").and_then(Value::as_str) == Some("document-changed") {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ =
                                    window.emit("leafloom:document-changed", frame.get("payload"));
                            }
                            continue;
                        }
                    }
                    if sender.send(line).is_err() {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        if !art_worker&&!reader_stopping.load(Ordering::SeqCst)&&!reader_failed.swap(true,Ordering::SeqCst){emit_host_failure(&app,"HOST_UNAVAILABLE");}
    });
    let host = Host {
        child: Arc::new(Mutex::new(child)),
        input,
        output,
        sequence: 0,
        failed,
        stopping,
        app:host_app,
        art_worker,
    };
    Ok(host)
}
fn wait_ready(host: &mut Host) -> Result<(),Box<dyn std::error::Error>> {
    let ready = host
        .output
        .recv_timeout(Duration::from_secs(30))
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok());
    if ready
        .as_ref()
        .and_then(|v| v.get("ready"))
        .and_then(Value::as_bool)
        != Some(true)
    {
        host.stop();
        return Err("Host startup failed".into());
    }
    Ok(())
}
fn start_host(resources:PathBuf,root:PathBuf,app:tauri::AppHandle)->Result<Host,Box<dyn std::error::Error>> { let mut host=spawn_host(resources,root,app,false)?;wait_ready(&mut host)?;Ok(host) }

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(all(debug_assertions, target_os = "macos"))]
    if std::env::var_os("LEAFLOOM_HIDDEN").is_some() {
        app.set_activation_policy(tauri::ActivationPolicy::Accessory);
    }

    #[cfg(target_os = "macos")]
    {
        use objc2_foundation::{NSString, NSUserDefaults};
        NSUserDefaults::standardUserDefaults()
            .setBool_forKey(false, &NSString::from_str("ApplePressAndHoldEnabled"));
        for (key,value) in [("NSDisabledDictationMenuItem",true),("NSDisabledCharacterPaletteMenuItem",true),("NSAutoFillHeuristicControllerEnabled",false),("NSFullScreenMenuItemEverywhere",false)]{NSUserDefaults::standardUserDefaults().setBool_forKey(value,&NSString::from_str(key));}
    }
    let resources = app.path().resource_dir()?;
    let default_root = app.path().document_dir()?.join("Leafloom");
    let profile_path = startup_diagnostics::profile_path(&app.config().identifier)?;
    let mut profile = preferences::read(&profile_path)?;
    let configured=profile.get("libraryDir").and_then(Value::as_str).map(PathBuf::from);
    let fixture=cfg!(debug_assertions)&&std::env::var_os("LEAFLOOM_FIXTURE_ROOT").is_some();
    let selected=if fixture {startup_library::Selection{root:configured.clone().unwrap_or_else(||default_root.clone()),fallback_from:None}} else {startup_library::select(&default_root,&app.path().home_dir()?,configured.as_deref())};
    if selected.fallback_from.is_some(){profile["libraryDir"]=json!(selected.root);preferences::write(&profile_path,&profile)?;}
    let library_fallback=selected.fallback_from;
    let root=selected.root;
    #[cfg(debug_assertions)]
    let root = match std::env::var_os("LEAFLOOM_FIXTURE_ROOT") {
        Some(path) => {
            let path = PathBuf::from(path);
            if !path.is_absolute() || !path.join(".leafloom-fixture").is_file() {
                return Err("Fixture root must be an absolute marked disposable directory".into());
            }
            path
        }
        None => root,
    };
    #[cfg(all(feature="native-test",debug_assertions))]
    app.add_capability(serde_json::json!({"identifier":"native-acceptance","windows":["main"],"permissions":["wdio:default","wdio-webdriver:default"]}).to_string())?;
    let library_lock = library_lock::acquire(&root)?;
    let mut host = start_host(resources.clone(), root.clone(), app.handle().clone())?;
    let language = host.request("getLanguage".into(), json!({}), None)?;
    let dictionary = language
        .get("value")
        .and_then(|value| value.get("dict"))
        .and_then(Value::as_object);
    let catalog = host.request("listLanguages".into(), json!({}), None)?;
    let languages = catalog
        .get("value")
        .and_then(Value::as_array)
        .map(|values| {
            values
                .iter()
                .filter_map(|value| {
                    Some((
                        value.get("code")?.as_str()?.to_owned(),
                        value.get("name")?.as_str()?.to_owned(),
                    ))
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if native_menu::install(app.handle(), dictionary, &languages).is_err(){eprintln!("{{\"event\":\"menu.failure\",\"code\":\"MENU_UNAVAILABLE\"}}");}
    if let Some(locale) = language.pointer("/value/locale").and_then(Value::as_str) {
        let _=native_menu::set_state(app.handle(), &json!({"language":locale}));
    }
    native_menu::listen(app.handle());
    let enabled=updater::configured(app.config().plugins.0.get("updater"));
    app.manage(updater::Service::new(&root,enabled)?);
    app.manage(State {
        host: Arc::new(Mutex::new(host)),
        resources,
        _library_lock: library_lock,
        secrets: Arc::new(secrets::Secrets::new(cfg!(debug_assertions) && std::env::var_os("LEAFLOOM_FIXTURE_ROOT").is_some())),
        jobs: Arc::new(Mutex::new(HashMap::new())),
        workers: Arc::new(Mutex::new(HashMap::new())),
        grants: Mutex::new(HashSet::new()),
        closing: AtomicBool::new(false),
        quitting: AtomicBool::new(false),
        update_restart: AtomicBool::new(false),
        root,
        languages,
        default_root,
        library_fallback:Mutex::new(library_fallback),
        profile_path,
        profile: Mutex::new(profile.clone()),
        window_bounds: Mutex::new(
            profile
                .get("window")
                .cloned()
                .unwrap_or_else(|| json!({"width":1200.,"height":800.})),
        ),
        fullscreen: AtomicBool::new(false),
        #[cfg(not(target_os = "macos"))]
        clipboard: Arc::new(Mutex::new(None)),
    });
    let window =
        tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
            .title("Leafloom")
            .inner_size(profile.pointer("/window/width").and_then(Value::as_f64).filter(|value| (800.0..=16384.0).contains(value)).unwrap_or(1200.), profile.pointer("/window/height").and_then(Value::as_f64).filter(|value| (600.0..=16384.0).contains(value)).unwrap_or(800.))
            .min_inner_size(800., 600.)
            .visible(false)
            .focused(false)
            .initialization_script(if cfg!(debug_assertions) { "window.__leafloomErrors=[];window.addEventListener('error',e=>window.__leafloomErrors.push(e.message+' '+e.filename+':'+e.lineno));window.addEventListener('unhandledrejection',e=>window.__leafloomErrors.push(String(e.reason?.stack??e.reason))); " } else { "" })
            .on_navigation(|url| {
                url.scheme() == "tauri"
                    || url.host_str() == Some("tauri.localhost") || url.scheme()=="about"
                    || cfg!(debug_assertions) && [Some("localhost"),Some("127.0.0.1")].contains(&url.host_str())
            })
            .build();
    let window = match window {
        Ok(window) => window,
        Err(e) => {
            if let Ok(mut host) = app.state::<State>().host.lock() {
                host.stop();
            }
            return Err(e.into());
        }
    };
    fullscreen_menu::synchronize(app.handle(),false,false).map_err(std::io::Error::other)?;
    if let (Some(x), Some(y)) = (
        profile.pointer("/window/x").and_then(Value::as_f64),
        profile.pointer("/window/y").and_then(Value::as_f64),
    ) {
        if x.is_finite()
            && y.is_finite()
            && app.available_monitors()?.iter().any(|monitor| {
                let scale = monitor.scale_factor();
                let position = monitor.position().to_logical::<f64>(scale);
                let size = monitor.size().to_logical::<f64>(scale);
                x + 100. < position.x + size.width
                    && x + 1100. > position.x
                    && y + 40. < position.y + size.height
                    && y >= position.y - 20.
            })
        {
            window.set_position(tauri::LogicalPosition::new(x, y))?;
        }
    }
    if profile
        .pointer("/window/maximized")
        .and_then(Value::as_bool)
        == Some(true)
    {
        window.maximize()?;
    }
    #[cfg(debug_assertions)]
    let hidden = std::env::var_os("LEAFLOOM_HIDDEN").is_some();
    #[cfg(not(debug_assertions))]
    let hidden = false;
    if enabled {updater::start_wake(app.handle().clone());}
    if !hidden {
        window.show()?;
    }
    Ok(())
}

fn startup_failed(message:&str)->! {
    let category = startup_diagnostics::Code::from_message(message);
    startup_diagnostics::record(STARTUP_PROFILE.get().cloned().flatten(), category);
    let code = category.label();
    eprintln!("Leafloom startup failed: {code}");
    #[cfg(debug_assertions)]let hidden=std::env::var_os("LEAFLOOM_HIDDEN").is_some();
    #[cfg(not(debug_assertions))]let hidden=false;
    if !hidden{rfd::MessageDialog::new().set_title("Leafloom could not start").set_description(format!("Check that your library folder is available, then open Leafloom again.\n\nDiagnostic: {code}")).set_level(rfd::MessageLevel::Error).show();}
    std::process::exit(1);
}

fn main() {
    if std::env::args_os().nth(1).is_some_and(|arg|arg=="--leafloom-decode-webp") {
        if std::env::args_os().count()!=2 {std::process::exit(64);}
        std::process::exit(image_codec::run());
    }
    let mut context = tauri::generate_context!();
    #[cfg(debug_assertions)]
    if let Some(root)=std::env::var_os("LEAFLOOM_FIXTURE_ROOT") {
        use std::hash::{Hash,Hasher};let mut hash=std::collections::hash_map::DefaultHasher::new();root.hash(&mut hash);context.config_mut().identifier=format!("org.mafifi.leafloom.fixture{:016x}",hash.finish());
    }
    let _ = STARTUP_PROFILE.set(startup_diagnostics::profile_path(&context.config().identifier).ok());
    let enable_updater=updater::configure(&mut context).unwrap_or_else(|error|startup_failed(&error));
    let builder = tauri::Builder::default().plugin(tauri_plugin_single_instance::init(|app,_,_|{
        #[cfg(debug_assertions)]
        if std::env::var_os("LEAFLOOM_HIDDEN").is_some(){return;}
        if let Some(window)=app.get_webview_window("main"){let _=window.unminimize();let _=window.show();let _=window.set_focus();}
    }));
    #[cfg(all(feature = "native-test", debug_assertions))]
    let builder = builder
        .plugin(tauri_plugin_wdio::init())
        .plugin(tauri_plugin_wdio_webdriver::init());
    let builder=if enable_updater {builder.plugin(tauri_plugin_updater::Builder::new().build())}else{builder};
    let application = builder
        .invoke_handler(tauri::generate_handler![
            host_request,
            os_request,
            finish_close
        ])
        // Tauri runs setup on Ready and panics on a returned error. Handle it
        // here before that error can cross the macOS delegate's unwind boundary.
        .setup(|app|match setup(app){Ok(())=>Ok(()),Err(error)=>{if let Some(state)=app.try_state::<State>(){stop_workers(&state);if let Ok(mut host)=state.host.lock(){host.stop();}}startup_failed(&error.to_string())}})
        .on_webview_event(|webview, event| {
            if webview.label() != "main" {
                return;
            }
            if let tauri::WebviewEvent::DragDrop(tauri::DragDropEvent::Drop { paths, position }) = event {
                if let Some(state) = webview.app_handle().try_state::<State>() {
                    #[cfg(target_os = "windows")]
                    let (space, scale) = {
                        let Ok(scale) = webview.window().scale_factor() else { return; };
                        (external_drop::CoordinateSpace::Physical, scale)
                    };
                    #[cfg(not(target_os = "windows"))]
                    let (space, scale) = (external_drop::CoordinateSpace::Logical, 1.0);
                    if let Ok(mut grants) = state.grants.lock() {
                        if let Some(drop) = external_drop::prepare_drop(paths, position.x, position.y, space, scale, &mut grants) {
                            let _ = webview.emit("leafloom:files-dropped", drop);
                        }
                    }
                }
            }
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let Some(state) = window.app_handle().try_state::<State>() {
                let fullscreen = window.is_fullscreen().unwrap_or(false);
                if state.fullscreen.swap(fullscreen, Ordering::SeqCst) != fullscreen { let _ = fullscreen_menu::synchronize(window.app_handle(),fullscreen,false);let _ = window.emit("leafloom:fullscreen-changed", json!({"fullscreen":fullscreen})); }
                if matches!(event, tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_)) && !fullscreen && !window.is_maximized().unwrap_or(false) {
                    if let (Ok(size), Ok(position), Ok(scale), Ok(mut bounds)) = (window.inner_size(), window.outer_position(), window.scale_factor(), state.window_bounds.lock()) {
                        let size = size.to_logical::<f64>(scale); let position = position.to_logical::<f64>(scale);
                        *bounds = json!({"width":size.width,"height":size.height,"x":position.x,"y":position.y});
                    }
                }
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if let Some(state) = window.app_handle().try_state::<State>() {
                    if let (Ok(mut profile), Ok(bounds)) = (state.profile.lock(), state.window_bounds.lock()) {
                        let mut bounds = bounds.clone(); bounds["maximized"] = json!(window.is_maximized().unwrap_or(false)); profile["window"] = bounds;
                        if preferences::write(&state.profile_path, &profile).is_err() { eprintln!("Leafloom window preferences could not be saved"); }
                    }
                }
                if let Some(state) = window.app_handle().try_state::<State>() {
                    if !state.closing.load(Ordering::SeqCst) {
                        api.prevent_close();
                        state.update_restart.store(false,Ordering::SeqCst);
                        state.quitting.store(false,Ordering::SeqCst);
                        let _ = window.emit("leafloom:close-requested", ());
                    }
                }
            }
        })
        .build(context);
    let application=match application {Ok(application)=>application,Err(error)=>startup_failed(&error.to_string())};
    application.run(|app, event| match event {
        tauri::RunEvent::ExitRequested { api, .. } => {
            if let Some(state) = app.try_state::<State>() {
                if !state.closing.load(Ordering::SeqCst) {
                    api.prevent_exit();
                    state.quitting.store(true,Ordering::SeqCst);
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.emit("leafloom:close-requested", ());
                    }
                }
            }
        }
        #[cfg(target_os="macos")]
        tauri::RunEvent::Reopen{..} => {#[cfg(debug_assertions)]if std::env::var_os("LEAFLOOM_HIDDEN").is_some(){return;}if let Some(window)=app.get_webview_window("main"){let _=window.show();let _=window.set_focus();}}
        tauri::RunEvent::Exit => {
            updater::stop_wake();
            #[cfg(target_os="macos")]edit_menu::stop();
            if let Some(state) = app.try_state::<State>() {
                stop_workers(&state);
                if let Ok(mut host) = state.host.lock() {
                    host.stop();
                }
            }
        }
        _ => {}
    });
}
