fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["host_request", "os_request", "finish_close"]),
    ))
    .expect("Could not generate Leafloom build context");
}
