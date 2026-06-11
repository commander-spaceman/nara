use serde::Serialize;
use tauri::Manager;

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
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            health_check,
            commands::memory::memory_start_session,
            commands::memory::memory_save_message,
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
            app.manage(database);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
