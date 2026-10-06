// Native OS requests retain the main-window authority boundary.
use super::*;

#[tauri::command]
pub(crate) async fn os_request(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, State>,
    method: String,
    payload: Value,
) -> Result<Value, String> {
    if window.label() != "main" {
        return Err("UNAUTHORIZED".into());
    }
    #[cfg(all(feature="native-test",debug_assertions,target_os="macos"))]
    if method=="_menuProbe" {
        if !state.root.join(".leafloom-fixture").is_file()||payload.as_object().is_none_or(|value|!value.is_empty()){return Err("UNAUTHORIZED".into());}
        let (sender,mut receiver)=tauri::async_runtime::channel(1);
        window.run_on_main_thread(move||{let result=objc2_foundation::MainThreadMarker::new().ok_or("OS_UNAVAILABLE").and_then(crate::edit_menu::probe);let _=sender.blocking_send(result);}).map_err(|_|"OS_UNAVAILABLE")?;
        return receiver.recv().await.ok_or("OS_UNAVAILABLE")?.map_err(str::to_owned);
    }
    #[cfg(all(feature="native-test",debug_assertions))]
    if std::env::var_os("LEAFLOOM_FIXTURE_DIALOGS").is_some() && matches!(method.as_str(),"selectImportFiles"|"selectExportFile"|"selectImportDirectory"|"selectExportDirectory"|"selectCover"|"selectCoverImage") {
        if method=="selectExportFile" && payload.get("name").and_then(Value::as_str).is_some_and(|name|name.contains(['/', '\\'])) {return Err("INVALID".into());}
        let reply=fixture_dialogs::take(&state.root,&method).map_err(str::to_owned)?;
        let mut grants=state.grants.lock().map_err(|_|"HOST_UNAVAILABLE")?;
        if let Some(paths)=reply.as_array(){for path in paths{grants.insert(PathBuf::from(path.as_str().ok_or("INVALID")?));}}
        else if let Some(path)=reply.as_str(){grants.insert(PathBuf::from(path));}
        return Ok(reply);
    }
    match method.as_str() {
        "hasSecret" | "setSecret" => {
            if payload.get("provider").and_then(Value::as_str)!=Some("openai") || payload.as_object().is_none_or(|v|v.keys().any(|k| k!="provider" && (method!="setSecret"||k!="value"))) {return Err("INVALID".into());}
            let store=state.secrets.clone();let setting=method=="setSecret";
            let value=if setting {Some(payload.get("value").ok_or("INVALID")?.clone())}else{None};
            tauri::async_runtime::spawn_blocking(move || { if let Some(value)=value {if !value.is_null()&&!value.is_string(){return Err("INVALID".into());}store.set("openai",value.as_str())?;}let configured=store.get("openai")?.is_some();Ok(json!({"provider":"openai","configured":configured,"storage":store.storage()}))}).await.map_err(|_|"SECRET_UNAVAILABLE")?
        }
        "restartHost" => {
            if payload.as_object().is_none_or(|v|!v.is_empty()){return Err("INVALID".into());}
            let host=state.host.clone();let resources=state.resources.clone();let root=state.root.clone();let app=window.app_handle().clone();
            tauri::async_runtime::spawn_blocking(move||{let mut current=host.lock().map_err(|_|"HOST_UNAVAILABLE")?;let exited=current.child.lock().map_err(|_|"HOST_UNAVAILABLE")?.try_wait().map_err(|_|"HOST_UNAVAILABLE")?.is_some();if !current.failed.load(Ordering::SeqCst)&&!exited{return Err("BUSY".into());}current.stop();let replacement=start_host(resources,root,app).map_err(|_|"HOST_UNAVAILABLE")?;*current=replacement;Ok(json!({"restarted":true,"rebindRequired":true}))}).await.map_err(|_|"HOST_UNAVAILABLE")?
        }
        "quitApp" => {if payload.as_object().is_none_or(|v|!v.is_empty()){return Err("INVALID".into());}state.update_restart.store(false,Ordering::SeqCst);state.quitting.store(true,Ordering::SeqCst);window.app_handle().exit(0);Ok(json!(true))}
        "restartToUpdate" => {if payload.as_object().is_none_or(|v|!v.is_empty()){return Err("INVALID".into());}if window.app_handle().state::<updater::Service>().status()["status"]!="ready"{return Err("UPDATE_UNAVAILABLE".into());}state.update_restart.store(true,Ordering::SeqCst);state.quitting.store(true,Ordering::SeqCst);window.app_handle().exit(0);Ok(json!(true))}
        "updateStatus" | "checkForUpdates" => {if payload.as_object().is_none_or(|v|!v.is_empty()){return Err("INVALID".into());}let app=window.app_handle();let service=app.state::<updater::Service>();Ok(if method=="checkForUpdates"{service.check(app).await}else{service.status()})}
        "installUpdatePending" => {if payload.as_object().is_none_or(|v|!v.is_empty()){return Err("INVALID".into());}if !state.quitting.load(Ordering::SeqCst){return Err("BUSY".into());}let host=state.host.clone();let reply=tauri::async_runtime::spawn_blocking(move||host.lock().map_err(|_|"HOST_UNAVAILABLE")?.request("runtimeState".into(),json!({}),None)).await.map_err(|_|"HOST_UNAVAILABLE")??;let open=reply.pointer("/value/openBooks").and_then(Value::as_u64).ok_or("HOST_PROTOCOL")?;Ok(json!({"installed":window.app_handle().state::<updater::Service>().install(window.app_handle(),open)?}))}
        "coverArtJob" => {let id=cover_book_id(&payload)?.to_owned();if payload.as_object().is_none_or(|v|v.len()!=1){return Err("INVALID".into());}let existing=state.jobs.lock().map_err(|_|"HOST_UNAVAILABLE")?.get(&id).cloned();if let Some(job)=existing{return Ok(job);}let host=state.host.clone();let response=tauri::async_runtime::spawn_blocking(move||host.lock().map_err(|_|"HOST_UNAVAILABLE")?.request("readCoverArtJob".into(),json!({"bookId":id}),None)).await.map_err(|_|"HOST_UNAVAILABLE")??;if response.get("ok").and_then(Value::as_bool)!=Some(true){return Err(response.get("code").and_then(Value::as_str).unwrap_or("HOST_UNAVAILABLE").into());}response.get("value").cloned().ok_or("HOST_PROTOCOL".into())}
        "paintCover" => {
            let book=cover_book_id(&payload)?.to_owned();
            if payload.as_object().is_none_or(|v|v.keys().any(|k|!["bookId","provider","textModel","imageModel","quality"].contains(&k.as_str()))) || payload.get("provider").is_some_and(|v|v.as_str()!=Some("openai")) || payload.get("quality").is_some_and(|v|!matches!(v.as_str(),Some("low"|"medium"|"high"))) {return Err("INVALID".into());}
            for key in ["textModel","imageModel"] {if let Some(value)=payload.get(key) {let value=value.as_str().ok_or("INVALID")?;if value.is_empty()||value.len()>128||!value.chars().all(|c|c.is_ascii_alphanumeric()||"._-".contains(c)){return Err("INVALID".into());}}}
            let key=state.secrets.get("openai")?.ok_or("MISSING_API_KEY")?;
            let job=uuid::Uuid::new_v4().to_string();let initial=json!({"bookId":book,"jobId":job,"status":"brief"});
            {let mut jobs=state.jobs.lock().map_err(|_|"HOST_UNAVAILABLE")?;if jobs.get(&book).and_then(|v|v.get("status")).and_then(Value::as_str).is_some_and(|s|["brief","painting","saving"].contains(&s)){return Err("BUSY".into());}jobs.insert(book.clone(),initial.clone());}
            let resources=state.resources.clone();let root=state.root.clone();let app=window.app_handle().clone();let workers=state.workers.clone();let jobs=state.jobs.clone();let mut request=payload;request["apiKey"]=json!(key);request["jobId"]=json!(job);
            tauri::async_runtime::spawn_blocking(move || {
                let result=(||->Result<Value,String>{let mut host=spawn_host(resources,root,app.clone(),true).map_err(|_|"HOST_UNAVAILABLE")?; {let mut active=workers.lock().map_err(|_|"HOST_UNAVAILABLE")?;if app.try_state::<State>().is_none_or(|s|s.closing.load(Ordering::SeqCst)){host.stop();return Err("HOST_UNAVAILABLE".into());}active.insert(book.clone(),host.child.clone());}if wait_ready(&mut host).is_err(){host.stop();return Err("HOST_UNAVAILABLE".into());}let response=host.request("_paintCover".into(),request,None);host.stop();let response=response?;if response.get("ok").and_then(Value::as_bool)!=Some(true){return Err(response.get("code").and_then(Value::as_str).unwrap_or("HOST_UNAVAILABLE").into());}response.get("value").cloned().ok_or("HOST_PROTOCOL".into())})();
                let final_state=match result {Ok(value)=>json!({"bookId":book,"jobId":job,"status":"done","result":value}),Err(code)=>json!({"bookId":book,"jobId":job,"status":"failed","code":code})};
                if let Ok(mut active)=workers.lock(){active.remove(&book);}if let Ok(mut jobs)=jobs.lock(){jobs.insert(book,final_state.clone());}let _=app.emit("leafloom:cover-art-progress",final_state);
            });
            Ok(initial)
        }
        "setMenuState" => {
            if payload.as_object().is_none_or(|values|values.iter().any(|(key,value)|{
                if ["typewriter","vim","markdownEmphasis","uiBright","poetry","flush"].contains(&key.as_str()){return !value.is_boolean();}
                if key=="interfaceZoom"{return !value.as_f64().is_some_and(|n|(1.0..=3.0).contains(&n));}
                if key=="writingStyle"{return !value.as_str().is_some_and(|v|["pantser","plotter"].contains(&v));}
                !["bodyFont","dropcap","align","language","spellLanguage","pageTheme","focus"].contains(&key.as_str())||!value.is_string()
            })){return Err("INVALID".into());}
            native_menu::set_state(window.app_handle(), &payload).map_err(|_| "OS_UNAVAILABLE")?;
            Ok(json!(true))
        }
        "closeWindow" => {if payload.as_object().is_none_or(|v|!v.is_empty()){return Err("INVALID".into());}window.close().map_err(|_|"OS_UNAVAILABLE")?;Ok(json!(true))}
        "getWindowState" => Ok(
            json!({ "fullscreen": window.is_fullscreen().map_err(|_| "OS_ERROR")?, "maximized": window.is_maximized().map_err(|_| "OS_ERROR")?, "focused": window.is_focused().map_err(|_| "OS_ERROR")?,"visible":window.is_visible().map_err(|_|"OS_ERROR")? }),
        ),
        "platformInfo" => {
            #[cfg(target_os = "macos")]
            let languages = {
                use objc2_foundation::NSLocale;
                NSLocale::preferredLanguages()
                    .iter()
                    .map(|value| value.to_string())
                    .collect::<Vec<_>>()
            };
            #[cfg(not(target_os = "macos"))]
            let languages = system_languages::preferred_languages();
            let fonts = if cfg!(target_os = "macos") {
                vec![
                    "Georgia",
                    "Palatino",
                    "Baskerville",
                    "Hoefler Text",
                    "Iowan Old Style",
                    "Jost",
                    "iA Writer Quattro",
                    "Libron",
                    "Readerly",
                    "Newsreader",
                ]
            } else if cfg!(target_os = "windows") {
                vec![
                    "Georgia",
                    "Palatino",
                    "Baskerville",
                    "Cambria",
                    "Constantia",
                    "Jost",
                    "iA Writer Quattro",
                    "Libron",
                    "Readerly",
                    "Newsreader",
                ]
            } else {
                vec![
                    "Gelasio",
                    "TeX Gyre Pagella",
                    "Libre Baskerville",
                    "Alegreya",
                    "Source Serif Pro",
                    "Jost",
                    "iA Writer Quattro",
                    "Libron",
                    "Readerly",
                    "Newsreader",
                ]
            };
            Ok(
                json!({"platform":std::env::consts::OS,"architecture":std::env::consts::ARCH,"languages":languages,"bodyFonts":fonts,"packaged":!cfg!(debug_assertions),"updaterPackaged":!cfg!(debug_assertions)||cfg!(all(feature="native-test",debug_assertions))&&state.root.join(".leafloom-updater.json").is_file(),"theme":if window.theme().map_err(|_|"OS_UNAVAILABLE")?==tauri::Theme::Dark{"dark"}else{"light"}}),
            )
        }
        "setTheme" => {
            let theme = match payload.get("theme").and_then(Value::as_str) {
                Some("dark") => Some(tauri::Theme::Dark),
                Some("light") => Some(tauri::Theme::Light),
                Some("system") => None,
                _ => return Err("INVALID".into()),
            };
            window.set_theme(theme).map_err(|_| "OS_UNAVAILABLE")?;
            Ok(Value::Null)
        }
        "fontFamilies" => {
            let (sender, mut receiver) = tauri::async_runtime::channel(1);
            window
                .run_on_main_thread(move || {
                    #[cfg(target_os = "macos")]
                    let families = {
                        use objc2_app_kit::NSFontManager;
                        use objc2_foundation::MainThreadMarker;
                        let manager = NSFontManager::sharedFontManager(
                            MainThreadMarker::new().expect("Main thread"),
                        );
                        manager
                            .availableFontFamilies()
                            .iter()
                            .map(|family| family.to_string())
                            .collect::<Vec<_>>()
                    };
                    #[cfg(not(target_os = "macos"))]
                    let families = font_kit::source::SystemSource::new()
                        .all_families();
                    #[cfg(not(target_os = "macos"))]
                    let families=match families {Ok(families)=>families,Err(_)=>{let _=sender.blocking_send(Err("OS_UNAVAILABLE"));return;}};
                    let mut families=families;
                    families.retain(|family|!family.is_empty()&&!family.starts_with('.')&&family.len()<=512&&!family.contains(['\r','\n','\0']));
                    families.sort();families.dedup();
                    let _ = sender.blocking_send(Ok::<_, &'static str>(families));
                })
                .map_err(|_| "OS_UNAVAILABLE")?;
            Ok(json!(receiver.recv().await.ok_or("OS_UNAVAILABLE")??))
        }
        "printManuscript" | "printChapter" => {
            let chapter_id=if method=="printChapter"{Some(payload.get("chapterId").and_then(Value::as_str).ok_or("INVALID")?.to_owned())}else{None};
            let book_id = payload
                .get("bookId")
                .and_then(Value::as_str)
                .ok_or("INVALID")?
                .to_owned();
            let language = payload
                .get("language")
                .and_then(Value::as_str)
                .unwrap_or("en")
                .to_owned();
            let host = state.host.clone();
            let generated=if method=="printManuscript"{payload.get("generatedCover").cloned()}else{None};
            let response = tauri::async_runtime::spawn_blocking(move || {
                host.lock()
                    .map_err(|_| "HOST_UNAVAILABLE".to_string())?
                    .request(
                        if chapter_id.is_some(){"renderChapterPreview"}else{"renderPreview"}.into(),
                        if let Some(chapter)=chapter_id{json!({"bookId":book_id,"chapterId":chapter,"language":language})}else{let mut request=json!({"bookId":book_id,"language":language});if let Some(generated)=generated{request["generatedCover"]=generated;}request},
                        None,
                    )
            })
            .await
            .map_err(|_| "HOST_UNAVAILABLE")??;
            if response.get("ok").and_then(Value::as_bool) != Some(true) {
                return Err(response
                    .get("code")
                    .and_then(Value::as_str)
                    .unwrap_or("INVALID")
                    .into());
            }
            let html = response
                .get("value")
                .and_then(Value::as_str)
                .ok_or("HOST_PROTOCOL")?;
            let document=Arc::new(print_document::PrintDocument::new(html).map_err(str::to_owned)?);
            let url=tauri::Url::from_file_path(document.path()).map_err(|_|"OS_UNAVAILABLE")?;
            let document_url=url.as_str().to_owned();
            let label = format!(
                "print-{}",
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_err(|_| "OS_UNAVAILABLE")?
                    .as_nanos()
            );
            let ready_url=format!("about:blank#leafloom-print-ready-{label}");
            let ready_script=format!("void document.body.offsetHeight;Promise.resolve(document.fonts&&document.fonts.ready).then(()=>Promise.all(Array.from(document.images,image=>image.decode?image.decode().catch(()=>{{}}):Promise.resolve()))).then(()=>{{window.location.href={};}});",serde_json::to_string(&ready_url).map_err(|_|"OS_UNAVAILABLE")?);
            let print_app=window.app_handle().clone();let print_label=label.clone();
            let printed=Arc::new(AtomicBool::new(false));
            let print_document=document.clone();
            let preview=tauri::WebviewWindowBuilder::new(
                window.app_handle(),
                label,
                tauri::WebviewUrl::External(url),
            )
            .title(if method=="printChapter"{"Leafloom — Print chapter"}else{"Leafloom — Print manuscript"})
            .inner_size(850., 1000.)
            .visible(false)
            .on_navigation(move|url| {
                if url.as_str()==ready_url {
                    if !printed.swap(true,Ordering::SeqCst){
                        let app=print_app.clone();let label=print_label.clone();
                        let owned_document=print_document.clone();
                        let _=print_app.run_on_main_thread(move||{
                            if let Some(preview)=app.get_webview_window(&label){
                                #[cfg(target_os="macos")]
                                {
                                    let completed_preview=preview.clone();
                                    let _=preview.with_webview(move|platform|{
                                        // Wry's print() starts an asynchronous sheet. Keep the
                                        // WebView/file alive until AppKit's operation completes.
                                        unsafe {
                                            let view=&*(platform.inner() as *mut objc2::runtime::AnyObject);
                                            let info=objc2_app_kit::NSPrintInfo::sharedPrintInfo();
                                            let operation:objc2::rc::Retained<objc2_app_kit::NSPrintOperation>=objc2::msg_send![view,printOperationWithPrintInfo:&*info];
                                            operation.setCanSpawnSeparateThread(false);
                                            let _=operation.runOperation();
                                        }
                                        let _=completed_preview.close();
                                        owned_document.cleanup();
                                    });
                                }
                                #[cfg(not(target_os="macos"))]
                                {let _=preview.print();} // No portable completion API: close the preview after printing.
                            }
                        });
                    }
                    // Keep the fully rendered document; this URL only signals readiness.
                    false
                }else{url.as_str()==document_url||url.as_str()=="about:blank"}
            })
            .on_page_load(move|preview, event| {
                if event.event() == tauri::webview::PageLoadEvent::Finished {
                    let _ = preview.show();
                    let _ = preview.eval(&ready_script);
                }
            })
            .build()
            .map_err(|_| "OS_UNAVAILABLE")?;
            preview.on_window_event(move|event|{if matches!(event,tauri::WindowEvent::Destroyed){document.cleanup();}});
            Ok(Value::Null)
        }
        "emailDraft" => {
            let host = state.host.clone();
            let response = tauri::async_runtime::spawn_blocking(move || {
                host.lock()
                    .map_err(|_| "HOST_UNAVAILABLE".to_string())?
                    .request("renderEmailDraft".into(), payload, None)
            })
            .await
            .map_err(|_| "HOST_UNAVAILABLE")??;
            if response.get("ok").and_then(Value::as_bool) != Some(true) {
                return Err(response
                    .get("code")
                    .and_then(Value::as_str)
                    .unwrap_or("INVALID")
                    .into());
            }
            let value = response.get("value").ok_or("HOST_PROTOCOL")?;
            let file = value
                .get("file")
                .and_then(Value::as_str)
                .ok_or("HOST_PROTOCOL")?;
            let to = value
                .get("to")
                .and_then(Value::as_str)
                .ok_or("HOST_PROTOCOL")?;
            let subject = value
                .get("subject")
                .and_then(Value::as_str)
                .ok_or("HOST_PROTOCOL")?;
            let body = value
                .get("body")
                .and_then(Value::as_str)
                .ok_or("HOST_PROTOCOL")?;
            let gmail = value.get("method").and_then(Value::as_str) == Some("gmail");
            if gmail {
                let mut url =
                    tauri::Url::parse("https://mail.google.com/mail/").map_err(|_| "INVALID")?;
                url.query_pairs_mut()
                    .append_pair("view", "cm")
                    .append_pair("fs", "1")
                    .append_pair("to", to)
                    .append_pair("su", subject)
                    .append_pair("body", body);
                open::that(url.as_str()).map_err(|_| "OS_ERROR")?;
                open::that(PathBuf::from(file).parent().ok_or("HOST_PROTOCOL")?)
                    .map_err(|_| "OS_ERROR")?;
                return Ok(json!({"ok":true,"method":"gmail","file":file}));
            }
            #[cfg(target_os = "macos")]
            {
                let script = r#"on run argv
                  tell application "Mail"
                    set msg to make new outgoing message with properties {subject:item 2 of argv, content:(item 3 of argv) & return & return, visible:true}
                    tell msg to make new to recipient at end of to recipients with properties {address:item 1 of argv}
                    tell msg to make new attachment with properties {file name:(POSIX file (item 4 of argv))} at after the last paragraph of content
                    activate
                  end tell
                end run"#;
                let ok = Command::new("/usr/bin/osascript")
                    .args(["-e", script, to, subject, body, file])
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status()
                    .map(|status| status.success())
                    .unwrap_or(false);
                if !ok {
                    let _ = open::that(PathBuf::from(file).parent().ok_or("HOST_PROTOCOL")?);
                }
                Ok(json!({"ok":ok,"method":"mail","file":file}))
            }
            #[cfg(not(target_os = "macos"))]
            {
                let mut url = tauri::Url::parse(&format!("mailto:{to}")).map_err(|_| "INVALID")?;
                url.query_pairs_mut()
                    .append_pair("subject", subject)
                    .append_pair("body", body);
                open::that(url.as_str()).map_err(|_| "OS_ERROR")?;
                open::that(PathBuf::from(file).parent().ok_or("HOST_PROTOCOL")?)
                    .map_err(|_| "OS_ERROR")?;
                Ok(json!({"ok":true,"method":"mailto","file":file}))
            }
        }
        "readClipboard" => {
            let (sender, mut receiver) = tauri::async_runtime::channel(1);
            #[cfg(not(target_os = "macos"))]
            let clipboard = state.clipboard.clone();
            window
                .run_on_main_thread(move || {
                    #[cfg(target_os = "macos")]
                    let value = {
                        use objc2_app_kit::{
                            NSPasteboard, NSPasteboardTypeHTML, NSPasteboardTypeString,
                        };
                        let board = NSPasteboard::generalPasteboard();
                        let text = board
                            .stringForType(unsafe { NSPasteboardTypeString })
                            .map(|value| value.to_string())
                            .unwrap_or_default();
                        let html = board
                            .stringForType(unsafe { NSPasteboardTypeHTML })
                            .map(|value| value.to_string());
                        json!({"text": text, "html": html})
                    };
                    #[cfg(not(target_os = "macos"))]
                    let value = {
                        let (text, html) = clipboard
                            .lock()
                            .ok()
                            .and_then(|mut value| {
                                if value.is_none() {
                                    *value = arboard::Clipboard::new().ok();
                                }
                                value.as_mut().map(|clipboard| {
                                    // arboard 3.6.1 reads the native HTML format on
                                    // Windows/X11/Wayland. Absence keeps plain text.
                                    let text = clipboard.get_text().unwrap_or_default();
                                    let html = clipboard.get().html().ok();
                                    (text, html)
                                })
                            })
                            .unwrap_or_default();
                        json!({"text":text,"html":html})
                    };
                    let _ = sender.blocking_send(value);
                })
                .map_err(|_| "OS_UNAVAILABLE")?;
            let value = receiver.recv().await.ok_or("OS_UNAVAILABLE")?;
            if value
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or("")
                .len()
                > 32 * 1024 * 1024
                || value
                    .get("html")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .len()
                    > 32 * 1024 * 1024
            {
                return Err("INVALID".into());
            }
            Ok(value)
        }
        "writeClipboard" => {
            let text = payload
                .get("text")
                .and_then(Value::as_str)
                .ok_or("INVALID")?
                .to_owned();
            let html = payload
                .get("html")
                .and_then(Value::as_str)
                .map(str::to_owned);
            if text.len() > 32 * 1024 * 1024
                || html
                    .as_ref()
                    .is_some_and(|value| value.len() > 32 * 1024 * 1024)
            {
                return Err("INVALID".into());
            }
            let (sender, mut receiver) = tauri::async_runtime::channel(1);
            #[cfg(not(target_os = "macos"))]
            let clipboard = state.clipboard.clone();
            window
                .run_on_main_thread(move || {
                    #[cfg(target_os = "macos")]
                    let result = {
                        use objc2_app_kit::{
                            NSPasteboard, NSPasteboardTypeHTML, NSPasteboardTypeString,
                        };
                        use objc2_foundation::NSString;
                        let board = NSPasteboard::generalPasteboard();
                        board.clearContents();
                        let mut ok = board.setString_forType(&NSString::from_str(&text), unsafe {
                            NSPasteboardTypeString
                        });
                        if let Some(html) = html {
                            ok &= board.setString_forType(&NSString::from_str(&html), unsafe {
                                NSPasteboardTypeHTML
                            });
                        }
                        ok
                    };
                    #[cfg(not(target_os = "macos"))]
                    let result = (|| -> Result<(), ()> {
                        let mut value = clipboard.lock().map_err(|_| ())?;
                        if value.is_none() {
                            *value = Some(arboard::Clipboard::new().map_err(|_| ())?);
                        }
                        let clipboard = value.as_mut().ok_or(())?;
                        if let Some(html) = html {
                            clipboard.set_html(html, Some(text)).map_err(|_| ())
                        } else {
                            clipboard.set_text(text).map_err(|_| ())
                        }
                    })()
                    .is_ok();
                    let _ = sender.blocking_send(result);
                })
                .map_err(|_| "OS_UNAVAILABLE")?;
            if receiver.recv().await.unwrap_or(false) {
                Ok(Value::Null)
            } else {
                Err("OS_UNAVAILABLE".into())
            }
        }
        "selectImportDirectory" | "selectExportDirectory" => {
            let path = rfd::AsyncFileDialog::new()
                .set_title(if method == "selectImportDirectory" {
                    "Import NEO book folder"
                } else {
                    "Export book parent folder"
                })
                .pick_folder()
                .await
                .map(|p| p.path().to_path_buf());
            if let Some(path) = path {
                let selected = if method == "selectExportDirectory" {
                    let name = payload
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or("Leafloom-export");
                    if name.is_empty() || name.contains(['/', '\\']) || name == "." || name == ".."
                    {
                        return Err("INVALID".into());
                    }
                    path.join(name)
                } else {
                    path
                };
                state
                    .grants
                    .lock()
                    .map_err(|_| "HOST_UNAVAILABLE")?
                    .insert(selected.clone());
                Ok(json!(selected))
            } else {
                Ok(Value::Null)
            }
        }
        "selectImportFiles" => {
            let selected = rfd::AsyncFileDialog::new()
                .set_title("Import manuscript")
                .add_filter("Manuscripts", &["docx", "txt", "md", "fountain", "fdx"])
                .pick_files()
                .await;
            let paths = selected
                .unwrap_or_default()
                .into_iter()
                .map(|file| file.path().to_path_buf())
                .collect::<Vec<_>>();
            let mut grants = state.grants.lock().map_err(|_| "HOST_UNAVAILABLE")?;
            for path in &paths {
                grants.insert(path.clone());
            }
            Ok(json!(paths))
        }
        "selectCover" | "selectCoverImage" => {
            let selected = rfd::AsyncFileDialog::new()
                .set_title("Choose a book cover")
                .add_filter("Images", &["png", "jpg", "jpeg", "webp"])
                .pick_file()
                .await
                .map(|p| p.path().to_path_buf());
            if let Some(path) = selected {
                state
                    .grants
                    .lock()
                    .map_err(|_| "HOST_UNAVAILABLE")?
                    .insert(path.clone());
                Ok(json!(path))
            } else {
                Ok(Value::Null)
            }
        }
        "selectExportFile" => {
            let name = payload
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("Leafloom-export.txt");
            if name.contains(['/', '\\']) {
                return Err("INVALID".into());
            }
            let selected = rfd::AsyncFileDialog::new()
                .set_title("Export manuscript")
                .set_file_name(name)
                .save_file()
                .await
                .map(|p| p.path().to_path_buf());
            if let Some(path) = selected {
                state
                    .grants
                    .lock()
                    .map_err(|_| "HOST_UNAVAILABLE")?
                    .insert(path.clone());
                Ok(json!(path))
            } else {
                Ok(Value::Null)
            }
        }
        "getLibraryConfiguration" => Ok(
            json!({"current": state.root, "default": state.default_root, "custom": state.root != state.default_root,"fallbackFrom":state.library_fallback.lock().map_err(|_|"HOST_UNAVAILABLE")?.take()}),
        ),
        "selectLibraryFolder" => {
            let selected = rfd::AsyncFileDialog::new()
                .set_title("Choose a Leafloom library folder")
                .set_directory(&state.root)
                .pick_folder()
                .await
                .map(|file| file.path().to_path_buf());
            if let Some(path) = selected.as_ref() {
                state
                    .grants
                    .lock()
                    .map_err(|_| "HOST_UNAVAILABLE")?
                    .insert(path.clone());
            }
            Ok(json!(selected))
        }
        "configureLibraryFolder" => {
            let value = payload.get("path").ok_or("INVALID")?;
            let selected = if value.is_null() {
                None
            } else {
                Some(PathBuf::from(value.as_str().ok_or("INVALID")?))
            };
            if let Some(path) = selected.as_ref() {
                if !path.is_absolute()
                    || !state
                        .grants
                        .lock()
                        .map_err(|_| "HOST_UNAVAILABLE")?
                        .contains(path)
                {
                    return Err("UNAUTHORIZED".into());
                }
                let metadata = std::fs::symlink_metadata(path).map_err(|_| "NOT_FOUND")?;
                if !metadata.is_dir() || metadata.is_symlink() {
                    return Err("INVALID".into());
                }
            }
            let mut stored = state.profile.lock().map_err(|_| "PROFILE_UNAVAILABLE")?;
            let mut profile = stored.clone();
            if let Some(path) = selected.as_ref() {
                profile["libraryDir"] = json!(path);
            } else {
                profile
                    .as_object_mut()
                    .ok_or("INVALID_PROFILE")?
                    .remove("libraryDir");
            }
            preferences::write(&state.profile_path, &profile)?;
            *stored = profile;
            Ok(
                json!({ "requiresRestart": selected.as_ref().unwrap_or(&state.default_root) != &state.root }),
            )
        }
        "restartApp" => {
            let mut host = state.host.lock().map_err(|_| "HOST_UNAVAILABLE")?;
            let response = host.request("runtimeState".into(), json!({}), None)?;
            if response.pointer("/value/openBooks").and_then(Value::as_u64) != Some(0) {
                return Err("BUSY".into());
            }
            state.closing.store(true, Ordering::SeqCst);
            stop_workers(&state);
            host.stop();
            window.app_handle().request_restart();
            Ok(json!(true))
        }
        "fullscreenEscape" => {
            let was_fullscreen = window.is_fullscreen().map_err(|_| "OS_ERROR")?;
            if was_fullscreen {
                window.set_fullscreen(false).map_err(|_| "OS_ERROR")?;
            }
            fullscreen_menu::synchronize(window.app_handle(),false,false)?;
            Ok(json!(was_fullscreen))
        }
        "revealNativeMenu" => {
            if payload.as_object().is_none_or(|value|!value.is_empty()){return Err("INVALID".into());}
            let full=window.is_fullscreen().map_err(|_|"OS_ERROR")?;
            fullscreen_menu::synchronize(window.app_handle(),full,true)?;
            Ok(json!(true))
        }
        "showBookFolder" => {
            let id = payload
                .get("bookId")
                .and_then(Value::as_str)
                .ok_or("INVALID")?;
            if id.is_empty()
                || id.len() > 128
                || !id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
            {
                return Err("INVALID".into());
            }
            let path = state.root.join(id);
            let metadata = std::fs::symlink_metadata(&path).map_err(|_| "NOT_FOUND")?;
            if !metadata.is_dir() || metadata.is_symlink() {
                return Err("INVALID".into());
            }
            open::that(&path).map_err(|_| "OS_ERROR")?;
            Ok(json!(true))
        }
        "showLibrary" => {
            open::that(&state.root).map_err(|_| "OS_ERROR")?;
            Ok(json!(true))
        }
        "openExternal" => {
            let url = payload
                .get("url")
                .and_then(Value::as_str)
                .ok_or("INVALID")?;
            let parsed = tauri::Url::parse(url).map_err(|_| "INVALID")?;
            if !["https", "mailto"].contains(&parsed.scheme()) {
                return Err("INVALID".into());
            }
            open::that(url).map_err(|_| "OS_ERROR")?;
            Ok(json!(true))
        }
        "toggleFullscreen" => {
            let full = window.is_fullscreen().map_err(|_| "OS_ERROR")?;
            window.set_fullscreen(!full).map_err(|_| "OS_ERROR")?;
            fullscreen_menu::synchronize(window.app_handle(),!full,false)?;
            Ok(json!(!full))
        }
        "version" => Ok(json!(env!("CARGO_PKG_VERSION"))),
        _ => Err("INVALID".into()),
    }
}
