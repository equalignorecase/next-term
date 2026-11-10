#[cfg(feature = "desktop")]
pub mod commands;
pub mod credentials;
pub mod db;
pub mod error;
pub mod models;
pub mod ssh;
pub mod validation;

#[cfg(feature = "desktop")]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use std::sync::Arc;
    use tauri::Manager;
    use crate::commands::AppState;
    use crate::credentials::OsCredentialStore;
    use crate::db::Database;
    use crate::ssh::{SessionManager, TauriEventSink};

    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| dirs::data_local_dir().unwrap_or_default().join("NexTerm"));

            let db_path = app_data_dir.join("nexterm.sqlite");
            let db = tauri::async_runtime::block_on(async {
                Database::connect(&db_path).await
            })
            .expect("Failed to initialize SQLite database");

            let credentials = Arc::new(OsCredentialStore::new());
            let sink = Arc::new(TauriEventSink::new(app.handle().clone()));
            let sessions = SessionManager::new(db.clone(), credentials.clone(), sink);

            app.manage(AppState {
                db,
                credentials,
                sessions,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_hosts,
            commands::get_host,
            commands::create_host,
            commands::update_host,
            commands::delete_host,
            commands::duplicate_host,
            commands::list_host_groups,
            commands::create_host_group,
            commands::delete_host_group,
            commands::connect_ssh,
            commands::disconnect_ssh,
            commands::send_terminal_input,
            commands::resize_terminal,
            commands::list_active_sessions,
            commands::submit_host_key_decision,
            commands::list_known_hosts,
            commands::delete_known_host,
            commands::save_credential,
            commands::delete_credential,
            commands::get_settings,
            commands::update_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running NexTerm application");
}
