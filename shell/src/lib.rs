use serde::Serialize;
use tauri::{Manager, RunEvent, WindowEvent};

mod background;
mod commands;
mod db;

use db::Database;

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    version: String,
}

#[tauri::command]
fn health_check() -> HealthResponse {
    HealthResponse {
        status: "ok".into(),
        version: env!("CARGO_PKG_VERSION").into(),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            health_check,
            commands::memory::memory_start_session,
            commands::memory::memory_end_session,
            commands::memory::memory_save_message,
            commands::memory::memory_list_sessions,
            commands::memory::memory_load_session,
            commands::memory::memory_search,
            commands::memory::memory_get_profile,
            commands::memory::memory_upsert_profile,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let app_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");

            let database = Database::new(app_dir).expect("failed to initialize database");
            database.close_previous_session().ok();
            app.manage(database);

            if cfg!(debug_assertions) {
                if let Some(webview) = app.get_webview_window("main") {
                    let _ = webview.open_devtools();
                }
            }

            background::detect_background(app.handle().clone());

            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::Destroyed) {
                if let Some(db) = window.try_state::<Database>() {
                    db.end_current_session().ok();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            if let Some(db) = app_handle.try_state::<Database>() {
                db.end_current_session().ok();
            }
        }
    });
}
