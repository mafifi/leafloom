#[path = "fullscreen_menu_policy.rs"]
mod policy;

pub fn synchronize(app: &tauri::AppHandle, fullscreen: bool, reveal: bool) -> Result<(), String> {
    use tauri::Manager;
    let Some(show) = policy::visibility(std::env::consts::OS, fullscreen, reveal) else {
        return Ok(());
    };
    let Some(window) = app.get_window("main") else {
        return Ok(());
    };
    if show {
        window.show_menu()
    } else {
        window.hide_menu()
    }
    .map_err(|_| "OS_UNAVAILABLE".into())
}
