use std::sync::Arc;

use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use tauri::State;
use uuid::Uuid;

use crate::credentials::CredentialStore;
use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::models::{
    AppSettings, ConnectSshRequest, Host, HostGroup, HostInput, HostKeyDecision, KnownHost,
    SessionInfo, SftpDirectoryListing, SftpTransferResult,
};
use crate::ssh::SessionManager;

pub struct AppState {
    pub db: Database,
    pub credentials: Arc<dyn CredentialStore>,
    pub sessions: SessionManager,
}

// ==================== HOST MANAGEMENT ====================

#[tauri::command]
pub async fn list_hosts(state: State<'_, AppState>) -> AppResult<Vec<Host>> {
    state.db.list_hosts().await
}

#[tauri::command]
pub async fn get_host(state: State<'_, AppState>, id: String) -> AppResult<Host> {
    state.db.get_host(&id).await
}

#[tauri::command]
pub async fn create_host(state: State<'_, AppState>, input: HostInput) -> AppResult<Host> {
    let mut cred_ref = None;
    if input.save_secret {
        if let Some(ref secret) = input.secret {
            if !secret.is_empty() {
                let ref_id = format!("nexterm-cred-{}", Uuid::new_v4());
                state.credentials.save_secret(&ref_id, secret)?;
                cred_ref = Some(ref_id);
            }
        }
    }
    state.db.create_host(&input, cred_ref).await
}

#[tauri::command]
pub async fn update_host(
    state: State<'_, AppState>,
    id: String,
    input: HostInput,
) -> AppResult<Host> {
    let existing = state.db.get_host(&id).await?;
    let mut cred_ref = existing.credential_reference.clone();

    if input.save_secret {
        if let Some(ref secret) = input.secret {
            if !secret.is_empty() {
                let ref_id = cred_ref.unwrap_or_else(|| format!("nexterm-cred-{}", Uuid::new_v4()));
                state.credentials.save_secret(&ref_id, secret)?;
                cred_ref = Some(ref_id);
            }
        }
    } else if let Some(ref old_ref) = cred_ref {
        // User unchecked "Save secret in OS Keychain" -> remove stored secret
        let _ = state.credentials.delete_secret(old_ref);
        cred_ref = None;
    }

    state.db.update_host(&id, &input, cred_ref).await
}

#[tauri::command]
pub async fn delete_host(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let deleted = state.db.delete_host(&id).await?;
    if let Some(ref cred_ref) = deleted.credential_reference {
        let _ = state.credentials.delete_secret(cred_ref);
    }
    Ok(())
}

#[tauri::command]
pub async fn duplicate_host(state: State<'_, AppState>, id: String) -> AppResult<Host> {
    let orig = state.db.get_host(&id).await?;
    let dup_input = HostInput {
        name: format!("{} (Copy)", orig.name),
        hostname: orig.hostname,
        port: orig.port,
        username: orig.username,
        auth_method: orig.auth_method,
        private_key_path: orig.private_key_path,
        group_id: orig.group_id,
        description: Some(orig.description),
        tags: Some(orig.tags),
        secret: None,
        save_secret: false,
    };
    state.db.create_host(&dup_input, None).await
}

// ==================== HOST GROUPS ====================

#[tauri::command]
pub async fn list_host_groups(state: State<'_, AppState>) -> AppResult<Vec<HostGroup>> {
    state.db.list_groups().await
}

#[tauri::command]
pub async fn create_host_group(
    state: State<'_, AppState>,
    name: String,
    sort_order: Option<i64>,
) -> AppResult<HostGroup> {
    state
        .db
        .create_group(&name, sort_order.unwrap_or(0))
        .await
}

#[tauri::command]
pub async fn delete_host_group(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.db.delete_group(&id).await
}

// ==================== SESSION MANAGEMENT ====================

#[tauri::command]
pub async fn connect_ssh(
    state: State<'_, AppState>,
    request: ConnectSshRequest,
) -> AppResult<SessionInfo> {
    state.sessions.connect_ssh(request).await
}

#[tauri::command]
pub async fn disconnect_ssh(state: State<'_, AppState>, session_id: String) -> AppResult<()> {
    state.sessions.disconnect_session(&session_id).await
}

#[tauri::command]
pub async fn send_terminal_input(
    state: State<'_, AppState>,
    session_id: String,
    data_base64: String,
) -> AppResult<()> {
    let bytes = BASE64_STANDARD
        .decode(&data_base64)
        .map_err(|e| AppError::Validation(format!("Invalid base64 terminal input: {e}")))?;
    state.sessions.send_terminal_input(&session_id, bytes).await
}

#[tauri::command]
pub async fn resize_terminal(
    state: State<'_, AppState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> AppResult<()> {
    state.sessions.resize_terminal(&session_id, cols, rows).await
}

#[tauri::command]
pub async fn list_active_sessions(state: State<'_, AppState>) -> AppResult<Vec<SessionInfo>> {
    Ok(state.sessions.list_active_sessions().await)
}

// ==================== SECURITY & CREDENTIALS ====================

#[tauri::command]
pub async fn submit_host_key_decision(
    state: State<'_, AppState>,
    decision: HostKeyDecision,
) -> AppResult<()> {
    state.sessions.submit_host_key_decision(decision).await
}

#[tauri::command]
pub async fn list_known_hosts(state: State<'_, AppState>) -> AppResult<Vec<KnownHost>> {
    state.db.list_known_hosts().await
}

#[tauri::command]
pub async fn delete_known_host(state: State<'_, AppState>, id: String) -> AppResult<()> {
    state.db.delete_known_host(&id).await
}

#[tauri::command]
pub async fn save_credential(
    state: State<'_, AppState>,
    host_id: String,
    secret: String,
) -> AppResult<Host> {
    if secret.is_empty() {
        return Err(AppError::Validation("Secret cannot be empty.".into()));
    }
    let host = state.db.get_host(&host_id).await?;
    let ref_id = host
        .credential_reference
        .unwrap_or_else(|| format!("nexterm-cred-{}", Uuid::new_v4()));
    state.credentials.save_secret(&ref_id, &secret)?;
    state
        .db
        .update_host_credential_reference(&host_id, Some(&ref_id))
        .await?;
    state.db.get_host(&host_id).await
}

#[tauri::command]
pub async fn delete_credential(state: State<'_, AppState>, host_id: String) -> AppResult<Host> {
    let host = state.db.get_host(&host_id).await?;
    if let Some(ref cred_ref) = host.credential_reference {
        state.credentials.delete_secret(cred_ref)?;
    }
    state
        .db
        .update_host_credential_reference(&host_id, None)
        .await?;
    state.db.get_host(&host_id).await
}

// ==================== SETTINGS ====================

#[tauri::command]
pub async fn get_settings(state: State<'_, AppState>) -> AppResult<AppSettings> {
    state.db.get_settings().await
}

#[tauri::command]
pub async fn update_settings(
    state: State<'_, AppState>,
    settings: AppSettings,
) -> AppResult<AppSettings> {
    state.db.update_settings(&settings).await
}

// ==================== SFTP FILE TRANSFER ====================

#[tauri::command]
pub async fn sftp_list_dir(
    state: State<'_, AppState>,
    session_id: String,
    path: Option<String>,
) -> AppResult<SftpDirectoryListing> {
    state.sessions.sftp_list_dir(&session_id, path).await
}

#[tauri::command]
pub async fn sftp_upload_file(
    state: State<'_, AppState>,
    session_id: String,
    local_path: String,
    remote_dir: Option<String>,
) -> AppResult<SftpTransferResult> {
    state
        .sessions
        .sftp_upload_file(&session_id, &local_path, remote_dir)
        .await
}

#[tauri::command]
pub async fn sftp_download_file(
    state: State<'_, AppState>,
    session_id: String,
    remote_path: String,
    local_path: String,
) -> AppResult<SftpTransferResult> {
    state
        .sessions
        .sftp_download_file(&session_id, &remote_path, &local_path)
        .await
}

#[tauri::command]
pub async fn sftp_create_dir(
    state: State<'_, AppState>,
    session_id: String,
    path: String,
) -> AppResult<()> {
    state.sessions.sftp_create_dir(&session_id, &path).await
}

#[tauri::command]
pub async fn sftp_delete_entry(
    state: State<'_, AppState>,
    session_id: String,
    path: String,
    is_dir: bool,
) -> AppResult<()> {
    state
        .sessions
        .sftp_delete_entry(&session_id, &path, is_dir)
        .await
}

