use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
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
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            health_check,
            background::background_set_probe,
            commands::config::config_load,
            commands::config::config_save,
            commands::config::config_get,
            commands::config::config_set,
            commands::config::config_get_api_key,
            commands::config::config_set_api_key,
            commands::config::config_delete_api_key,
            commands::memory::memory_start_session,
            commands::memory::memory_end_session,
            commands::memory::memory_save_message,
            commands::memory::memory_list_sessions,
            commands::memory::memory_load_session,
            commands::memory::memory_search,
            commands::memory::memory_get_profile,
            commands::memory::memory_upsert_profile,
            commands::quarian_fx::quarian_fx,
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

            #[cfg(windows)]
            app.manage(background::BackgroundProbeState::default());

            background::detect_background(app.handle().clone());

            let show_hide =
                MenuItem::with_id(app, "toggle_visibility", "Show / Hide", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_hide, &quit])?;

            let _tray = TrayIconBuilder::new()
                .icon(
                    app.default_window_icon()
                        .cloned()
                        .expect("no default window icon"),
                )
                .menu(&menu)
                .on_menu_event(|app_handle, event| match event.id().as_ref() {
                    "toggle_visibility" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    "quit" => {
                        app_handle.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

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
