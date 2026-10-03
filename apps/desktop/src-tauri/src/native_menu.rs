use tauri::menu::{CheckMenuItem, MenuBuilder, MenuItem, MenuItemKind, SubmenuBuilder};
use tauri::{Emitter, Manager};
fn item(
    app: &tauri::AppHandle,
    id: &str,
    label: &str,
    shortcut: Option<&str>,
) -> tauri::Result<MenuItem<tauri::Wry>> {
    MenuItem::with_id(app, id, label, true, shortcut)
}
fn toggle(app:&tauri::AppHandle,id:&str,label:&str,checked:bool,shortcut:Option<&str>)->tauri::Result<CheckMenuItem<tauri::Wry>> {CheckMenuItem::with_id(app,id,label,true,checked,shortcut)}
fn choices(
    app: &tauri::AppHandle,
    label: &str,
    prefix: &str,
    values: &[(&str, &str)],
    dictionary: Option<&serde_json::Map<String, serde_json::Value>>,
) -> tauri::Result<tauri::menu::Submenu<tauri::Wry>> {
    let t = |label: &str| {
        dictionary
            .and_then(|dictionary| dictionary.get(label))
            .and_then(serde_json::Value::as_str)
            .unwrap_or(label)
            .to_owned()
    };
    let mut menu = SubmenuBuilder::new(app, t(label));
    for (value, label) in values {
        menu = menu.item(&CheckMenuItem::with_id(
            app,
            &format!("{prefix}:{value}"),
            t(label),
            true,
            false,
            match (prefix,*value) {
                ("align","left")=>Some("CmdOrCtrl+Shift+L"),
                ("align","center")=>Some("CmdOrCtrl+Shift+C"),
                ("align","right")=>Some("CmdOrCtrl+Shift+R"),
                ("align","justify")=>Some("CmdOrCtrl+Shift+J"),
                _=>None,
            },
        )?);
    }
    if prefix=="body-font" {
        menu=menu.separator().item(&item(app,"body-font-pick",&t("Other Font…"),None)?);
    }
    menu.build()
}
pub fn install(
    app: &tauri::AppHandle,
    dictionary: Option<&serde_json::Map<String, serde_json::Value>>,
    languages: &[(String, String)],
) -> tauri::Result<()> {
    let t = |label: &str| {
        dictionary
            .and_then(|dictionary| dictionary.get(label))
            .and_then(serde_json::Value::as_str)
            .unwrap_or(label)
            .to_owned()
    };
    let body_fonts = if cfg!(target_os = "macos") {
        vec![
            ("Georgia", "Georgia"),
            ("Palatino", "Palatino"),
            ("Baskerville", "Baskerville"),
            ("Hoefler Text", "Hoefler Text"),
            ("Iowan Old Style", "Iowan Old Style"),
            ("Jost", "Jost"),
        ]
    } else if cfg!(target_os = "windows") {
        vec![
            ("Georgia", "Georgia"),
            ("Palatino", "Palatino"),
            ("Baskerville", "Baskerville"),
            ("Cambria", "Cambria"),
            ("Constantia", "Constantia"),
            ("Jost", "Jost"),
        ]
    } else {
        vec![
            ("Gelasio", "Gelasio"),
            ("TeX Gyre Pagella", "TeX Gyre Pagella"),
            ("Libre Baskerville", "Libre Baskerville"),
            ("Alegreya", "Alegreya"),
            ("Source Serif Pro", "Source Serif Pro"),
            ("Jost", "Jost"),
        ]
    };
    let language_values = languages
        .iter()
        .map(|(code, name)| (code.as_str(), name.as_str()))
        .collect::<Vec<_>>();
    let application = SubmenuBuilder::new(app, "Leafloom")
        .about(None)
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;
    let file = SubmenuBuilder::new(app, t("File"))
        .item(&item(app, "new-book", &t("New Book"), Some("CmdOrCtrl+N"))?)
        .item(&item(
            app,
            "new-chapter",
            &t("New Chapter"),
            Some("CmdOrCtrl+Shift+N"),
        )?)
        .separator()
        .item(&item(app, "import", &t("Import…"), Some("CmdOrCtrl+Shift+I"))?)
        .item(&item(app, "reshelve-book", &t("Reshelve a Book…"), None)?)
        .item(&item(app, "email-draft", &t("Email Draft to Myself"), Some("CmdOrCtrl+E"))?)
        .item(&item(app, "email-settings", &t("Email Settings…"), None)?)
        .item(&item(app, "cover-art", &t("Cover Art…"), None)?)
        .item(&item(app, "goals", &t("Goals…"), Some("CmdOrCtrl+,"))?)
        .item(&item(app, "library-folder", &t("Library Folder…"), None)?)
        .item(&item(
            app,
            "show-book-folder",
            &t("Show Book Folder"),
            None,
        )?)
        .item(&item(app, "save", &t("Save"), Some("CmdOrCtrl+S"))?)
        .item(&item(app, "export", &t("Export…"), None)?)
        .item(&item(app, "print", &t("Print…"), Some("CmdOrCtrl+P"))?)
        .separator()
        .close_window()
        .build()?;
    let edit = SubmenuBuilder::new(app, t("Edit"))
        .item(&item(app, "undo", &t("Undo"), Some("CmdOrCtrl+Z"))?)
        .item(&item(app, "redo", &t("Redo"), Some("CmdOrCtrl+Shift+Z"))?)
        .separator()
        .cut()
        .copy()
        .paste()
        .item(&item(
            app,
            "paste-match-style",
            &t("Paste and Match Style"),
            Some(if cfg!(target_os = "macos") {
                "CmdOrCtrl+Alt+Shift+V"
            } else {
                "CmdOrCtrl+Shift+V"
            }),
        )?)
        .select_all()
        .separator()
        .item(&item(app, "find", &t("Find"), Some("CmdOrCtrl+F"))?)
        .item(&item(
            app,
            "spellcheck",
            &t("Spellcheck Pass"),
            Some("CmdOrCtrl+;"),
        )?)
        .item(&choices(
            app,
            "Spellcheck Language",
            "spell-language",
            &[
                ("en-US", "English (US)"),
                ("en-GB", "English (UK)"),
                ("en-AU", "English (Australia)"),
                ("en-CA", "English (Canada)"),
                ("fr", "Français"),
                ("de", "Deutsch"),
                ("es", "Español"),
                ("el", "Ελληνικά"),
                ("nl", "Nederlands"),
                ("pl", "Polski"),
                ("pt", "Português"),
                ("ro", "Română"),
                ("ru", "Русский"),
            ],
            dictionary,
        )?)
        .build()?;
    let format = SubmenuBuilder::new(app, t("Format"))
        .item(&choices(
            app,
            "Body Font",
            "body-font",
            &body_fonts,
            dictionary,
        )?)
        .item(&choices(
            app,
            "Drop Cap Style",
            "dropcap",
            &[
                ("literary", "Literary"),
                ("fantasy", "Fantasy"),
                ("scifi", "Sci-Fi"),
                ("none", "Off"),
            ],
            dictionary,
        )?)
        .item(&choices(
            app,
            "Align Paragraph",
            "align",
            &[
                ("left", "Left"),
                ("center", "Center"),
                ("right", "Right"),
                ("justify", "Justify"),
            ],
            dictionary,
        )?)
        .separator()
        .item(&item(app, "bold", &t("Bold"), Some("CmdOrCtrl+B"))?)
        .item(&item(app, "italic", &t("Italic"), Some("CmdOrCtrl+I"))?)
        .item(&toggle(app, "poetry", &t("Poetry Paragraph"), false, None)?)
        .item(&item(app, "scene-break", &t("Scene Break"), None)?)
        .separator()
        .item(&item(app,"text-larger",&t("Larger Text"),Some("CmdOrCtrl+="))?)
        .item(&item(app,"text-smaller",&t("Smaller Text"),Some("CmdOrCtrl+-"))?)
        .item(&item(app,"text-reset",&t("Reset Text Size"),Some("CmdOrCtrl+0"))?)
        .separator()
        .item(&toggle(app,"typewriter",&t("Typewriter Scrolling"),false,Some("CmdOrCtrl+Shift+T"))?)
        .item(&toggle(app,"markdown-emphasis",&t("Markdown Emphasis"),true,None)?)
        .build()?;
    let view = SubmenuBuilder::new(app, t("View"))
        .item(&choices(app,"Writing Style","writing-style",&[("pantser","Pantser"),("plotter","Plotter")],dictionary)?)
        .item(&item(app,"help",&t("Keyboard Shortcuts…"),Some("CmdOrCtrl+/"))?)
        .item(&item(app,"focus-cycle",&t("Cycle Focus Mode"),Some("CmdOrCtrl+Shift+O"))?)
        .item(&toggle(app,"vim",&t("Vim Keys"),false,None)?)
        .item(&toggle(app,"ui-bright",&t("Brighter Interface"),false,None)?)
        .item(&choices(app,"Interface Size","interface-zoom",&[("1","Normal"),("1.25","125%"),("1.5","150%"),("2","200%"),("2.5","250%"),("3","300%")],dictionary)?)
        .item(&choices(
            app,
            "Language",
            "language",
            &language_values,
            dictionary,
        )?)
        .item(&choices(
            app,
            "Page",
            "page-theme",
            &[("night", "Night"), ("paper", "Paper"), ("light", "Light")],
            dictionary,
        )?)
        .item(&choices(
            app,
            "Focus Mode",
            "focus",
            &[
                ("off", "Off"),
                ("sentence", "Sentence"),
                ("paragraph", "Paragraph"),
            ],
            dictionary,
        )?)
        .separator()
        .item(&item(
            app,
            "settings",
            &t("Settings…"),
            None,
        )?)
        .item(&item(
            app,
            "fullscreen",
            &t("Enter Full Screen"),
            Some("CmdOrCtrl+Shift+F"),
        )?)
        .separator()
        .item(&item(app, "zoom-in", &t("Zoom In"), None)?)
        .item(&item(app, "zoom-out", &t("Zoom Out"), None)?)
        .build()?;
    let window = SubmenuBuilder::new(app, t("Window"))
        .minimize()
        .maximize()
        .build()?;
    let help = SubmenuBuilder::new(app, t("Help"))
        .item(&item(app, "help-shortcuts", &t("Leafloom Help"), None)?)
        .item(&item(app,"about",&t("About Leafloom"),None)?)
        .item(&item(app,"check-update",&t("Check for Update…"),None)?)
        .build()?;
    let menu = MenuBuilder::new(app)
        .items(&[&application, &file, &edit, &format, &view, &window, &help])
        .build()?;
    app.set_menu(menu)?;
    #[cfg(target_os="macos")]{
        let title=t("Edit");
        let labels=edit.items()?.into_iter().filter_map(|item|match item{MenuItemKind::MenuItem(item)=>item.text().ok(),MenuItemKind::Check(item)=>item.text().ok(),MenuItemKind::Submenu(item)=>item.text().ok(),MenuItemKind::Predefined(item)=>item.text().ok(),_=>None}).collect();
        app.run_on_main_thread(move||{if let Some(mtm)=objc2_foundation::MainThreadMarker::new(){crate::edit_menu::configure(title,labels,mtm);}})?;
    }
    Ok(())
}
pub fn listen(app: &tauri::AppHandle) {
    app.on_menu_event(|app, event| {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.emit("leafloom:menu-command", event.id().as_ref());
        }
    });
}

pub fn set_state(app: &tauri::AppHandle, state: &serde_json::Value) -> tauri::Result<()> {
    let Some(menu) = app.menu() else {
        return Ok(());
    };
    for (key, prefix) in [
        ("bodyFont", "body-font"),
        ("writingStyle", "writing-style"),
        ("dropcap", "dropcap"),
        ("align", "align"),
        ("language", "language"),
        ("spellLanguage", "spell-language"),
        ("pageTheme", "page-theme"),
        ("focus", "focus"),
        ("interfaceZoom", "interface-zoom"),
    ] {
        let selected = state.get(key).and_then(|v|v.as_str().map(String::from).or_else(||v.as_f64().map(|n|n.to_string())));
        let Some(selected) = selected else {
            continue;
        };
        fn visit(
            menu: &tauri::menu::Menu<tauri::Wry>,
            prefix: &str,
            selected: &str,
        ) -> tauri::Result<()> {
            fn items(
                entries: Vec<MenuItemKind<tauri::Wry>>,
                prefix: &str,
                selected: &str,
            ) -> tauri::Result<()> {
                for item in entries {
                    match item {
                        MenuItemKind::Check(check) => {
                            let id = check.id().as_ref();
                            if let Some(value) = id.strip_prefix(&format!("{prefix}:")) {
                                check.set_checked(value == selected)?;
                            }
                        }
                        MenuItemKind::Submenu(submenu) => {
                            items(submenu.items()?, prefix, selected)?
                        }
                        _ => (),
                    }
                }
                Ok(())
            }
            items(menu.items()?, prefix, selected)
        }
        visit(&menu, prefix, &selected)?;
    }
    fn ticks(entries:Vec<MenuItemKind<tauri::Wry>>,state:&serde_json::Value)->tauri::Result<()> {for entry in entries {match entry {MenuItemKind::Check(check)=>{let key=match check.id().as_ref(){"typewriter"=>Some("typewriter"),"vim"=>Some("vim"),"markdown-emphasis"=>Some("markdownEmphasis"),"ui-bright"=>Some("uiBright"),"poetry"=>Some("poetry"),_=>None};if let Some(value)=key.and_then(|k|state.get(k)).and_then(serde_json::Value::as_bool){check.set_checked(value)?;}},MenuItemKind::Submenu(menu)=>ticks(menu.items()?,state)?,_=>()}}Ok(())}
    ticks(menu.items()?,state)?;
    Ok(())
}
