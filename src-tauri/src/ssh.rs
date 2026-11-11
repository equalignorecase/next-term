use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use base64::engine::general_purpose::{STANDARD as BASE64_STANDARD, STANDARD_NO_PAD};
use base64::Engine;
use chrono::Utc;
use russh::client::{self, Handle};
use russh::keys::key::PrivateKeyWithHashAlg;
use russh::keys::{decode_secret_key, PublicKey, PublicKeyBase64};
use russh::{ChannelMsg, Disconnect};
use sha2::{Digest, Sha256};
#[cfg(feature = "desktop")]
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, oneshot, Mutex, RwLock};
use tokio::time::timeout;
use uuid::Uuid;

use crate::credentials::CredentialStore;
use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::models::{
    AuthMethod, ConnectSshRequest, HostKeyChallengeEvent, HostKeyDecision, HostKeyStatus,
    SessionInfo, SessionState, SftpDirectoryListing, SftpEntry, SftpEntryKind, SftpTransferResult,
    SshClosedEvent, SshErrorEvent, SshOutputEvent, SshStatusEvent, SshTelemetryEvent,
};
use russh_sftp::client::SftpSession;
use russh_sftp::protocol::FileType;
use zeroize::Zeroizing;
use crate::validation::{
    format_host_identity, sanitize_remote_filename, validate_local_transfer_path,
    validate_terminal_dimensions,
};

const SFTP_INIT_TIMEOUT_SECS: u64 = 15;
const MAX_SFTP_DIR_ENTRIES: usize = 5_000;

/// Event emitter abstraction so `SessionManager` works in both Tauri runtime and headless Rust integration tests.
pub trait SessionEventSink: Send + Sync {
    fn emit_status(&self, event: SshStatusEvent);
    fn emit_output(&self, event: SshOutputEvent);
    fn emit_error(&self, event: SshErrorEvent);
    fn emit_closed(&self, event: SshClosedEvent);
    fn emit_host_key_challenge(&self, event: HostKeyChallengeEvent);
    fn emit_telemetry(&self, event: SshTelemetryEvent);
}

#[cfg(feature = "desktop")]
pub struct TauriEventSink {
    app: AppHandle,
}

#[cfg(feature = "desktop")]
impl TauriEventSink {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

#[cfg(feature = "desktop")]
impl SessionEventSink for TauriEventSink {
    fn emit_status(&self, event: SshStatusEvent) {
        let _ = self.app.emit("ssh:status", event);
    }

    fn emit_output(&self, event: SshOutputEvent) {
        let _ = self.app.emit("ssh:output", event);
    }

    fn emit_error(&self, event: SshErrorEvent) {
        let _ = self.app.emit("ssh:error", event);
    }

    fn emit_closed(&self, event: SshClosedEvent) {
        let _ = self.app.emit("ssh:closed", event);
    }

    fn emit_host_key_challenge(&self, event: HostKeyChallengeEvent) {
        let _ = self.app.emit("ssh:host-key-challenge", event);
    }

    fn emit_telemetry(&self, event: SshTelemetryEvent) {
        let _ = self.app.emit("ssh:telemetry", event);
    }
}

enum SessionCommand {
    Input(Vec<u8>),
    Resize { cols: u16, rows: u16 },
    Disconnect,
}

struct ManagedSession {
    info: SessionInfo,
    cmd_tx: Option<mpsc::Sender<SessionCommand>>,
    cancel_tx: Option<oneshot::Sender<()>>,
    host_key_decision_tx: Option<oneshot::Sender<HostKeyDecision>>,
    ssh_handle: Option<Arc<Mutex<Handle<SshClientHandler>>>>,
}

struct SshClientHandler {
    session_id: String,
    hostname: String,
    port: u16,
    db: Database,
    sink: Arc<dyn SessionEventSink>,
    sessions: Arc<RwLock<HashMap<String, ManagedSession>>>,
}

pub fn compute_sha256_fingerprint(public_key_base64: &str) -> String {
    if let Ok(raw) = BASE64_STANDARD.decode(public_key_base64) {
        let digest = Sha256::digest(&raw);
        format!("SHA256:{}", STANDARD_NO_PAD.encode(digest))
    } else {
        let digest = Sha256::digest(public_key_base64.as_bytes());
        format!("SHA256:{}", STANDARD_NO_PAD.encode(digest))
    }
}

#[async_trait]
impl client::Handler for SshClientHandler {
    type Error = AppError;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        // Transition session to VerifyingHost
        update_session_state(
            &self.sessions,
            &self.sink,
            &self.session_id,
            SessionState::VerifyingHost,
            Some("Verifying server host key...".into()),
        )
        .await;

        let host_identity = format_host_identity(&self.hostname, self.port);
        let pub_b64 = server_public_key.public_key_base64();
        let algorithm = server_public_key.algorithm().to_string();
        let fingerprint = compute_sha256_fingerprint(&pub_b64);

        let existing = self.db.get_known_host(&host_identity).await?;

        let (status, previous_fingerprint) = match existing {
            Some(known) => {
                if known.public_key == pub_b64 && known.key_algorithm == algorithm {
                    // Trusted host key matches!
                    return Ok(true);
                }
                (HostKeyStatus::Changed, Some(known.fingerprint))
            }
            None => (HostKeyStatus::Unknown, None),
        };

        // Host key is either unknown or changed! Never auto-accept.
        let (tx, rx) = oneshot::channel::<HostKeyDecision>();
        {
            let mut guard = self.sessions.write().await;
            if let Some(session) = guard.get_mut(&self.session_id) {
                session.host_key_decision_tx = Some(tx);
            } else {
                return Ok(false);
            }
        }

        self.sink.emit_host_key_challenge(HostKeyChallengeEvent {
            session_id: self.session_id.clone(),
            host_identity: host_identity.clone(),
            hostname: self.hostname.clone(),
            port: self.port,
            key_algorithm: algorithm.clone(),
            fingerprint: fingerprint.clone(),
            public_key_base64: pub_b64.clone(),
            status,
            previous_fingerprint,
        });

        // Wait up to 120 seconds for explicit user confirmation
        match timeout(Duration::from_secs(120), rx).await {
            Ok(Ok(decision)) => {
                if !decision.trust {
                    return Err(AppError::HostKeyRejected(
                        "User rejected server host key verification.".into(),
                    ));
                }
                if decision.persist {
                    self.db
                        .upsert_known_host(&host_identity, &algorithm, &pub_b64, &fingerprint)
                        .await?;
                }
                Ok(true)
            }
            _ => Err(AppError::HostKeyRejected(
                "Host key verification timed out or was cancelled.".into(),
            )),
        }
    }
}

async fn update_session_state(
    sessions: &Arc<RwLock<HashMap<String, ManagedSession>>>,
    sink: &Arc<dyn SessionEventSink>,
    session_id: &str,
    next_state: SessionState,
    message: Option<String>,
) {
    let mut guard = sessions.write().await;
    if let Some(session) = guard.get_mut(session_id) {
        if session.info.state.can_transition_to(next_state) || session.info.state == next_state {
            session.info.state = next_state;
            if next_state == SessionState::Connected && session.info.connected_at.is_none() {
                session.info.connected_at = Some(Utc::now().to_rfc3339());
            }
            if next_state == SessionState::Failed {
                session.info.error_message = message.clone();
            }
        }
    }
    drop(guard);

    sink.emit_status(SshStatusEvent {
        session_id: session_id.to_string(),
        state: next_state,
        message,
    });
}

#[derive(Clone)]
pub struct SessionManager {
    db: Database,
    credentials: Arc<dyn CredentialStore>,
    sink: Arc<dyn SessionEventSink>,
    sessions: Arc<RwLock<HashMap<String, ManagedSession>>>,
    connect_lock: Arc<Mutex<()>>,
}

impl SessionManager {
    pub fn new(
        db: Database,
        credentials: Arc<dyn CredentialStore>,
        sink: Arc<dyn SessionEventSink>,
    ) -> Self {
        Self {
            db,
            credentials,
            sink,
            sessions: Arc::new(RwLock::new(HashMap::new())),
            connect_lock: Arc::new(Mutex::new(())),
        }
    }

    pub async fn list_active_sessions(&self) -> Vec<SessionInfo> {
        let guard = self.sessions.read().await;
        guard.values().map(|s| s.info.clone()).collect()
    }

    pub async fn get_session_info(&self, session_id: &str) -> Option<SessionInfo> {
        let guard = self.sessions.read().await;
        guard.get(session_id).map(|s| s.info.clone())
    }

    pub async fn submit_host_key_decision(&self, decision: HostKeyDecision) -> AppResult<()> {
        let tx = {
            let mut guard = self.sessions.write().await;
            let session = guard.get_mut(&decision.session_id).ok_or_else(|| {
                AppError::Session(format!("Session '{}' not found", decision.session_id))
            })?;
            session.host_key_decision_tx.take().ok_or_else(|| {
                AppError::Validation(
                    "No pending host key verification challenge for this session.".into(),
                )
            })?
        };

        tx.send(decision)
            .map_err(|_| AppError::Session("Session closed before decision was applied.".into()))?;
        Ok(())
    }

    pub async fn send_terminal_input(&self, session_id: &str, data: Vec<u8>) -> AppResult<()> {
        if data.is_empty() {
            return Ok(());
        }
        let tx = {
            let guard = self.sessions.read().await;
            let session = guard.get(session_id).ok_or_else(|| {
                AppError::Session(format!("Active session '{session_id}' not found"))
            })?;
            if session.info.state != SessionState::Connected {
                return Err(AppError::Session(
                    "Cannot send input: session is not connected.".into(),
                ));
            }
            session
                .cmd_tx
                .clone()
                .ok_or_else(|| AppError::Session("Session input channel unavailable.".into()))?
        };

        tx.send(SessionCommand::Input(data))
            .await
            .map_err(|_| AppError::Session("Failed to send input to SSH channel.".into()))?;
        Ok(())
    }

    pub async fn resize_terminal(&self, session_id: &str, cols: u16, rows: u16) -> AppResult<()> {
        validate_terminal_dimensions(cols, rows)?;

        let tx = {
            let mut guard = self.sessions.write().await;
            let session = guard.get_mut(session_id).ok_or_else(|| {
                AppError::Session(format!("Active session '{session_id}' not found"))
            })?;
            session.info.cols = cols;
            session.info.rows = rows;
            if session.info.state != SessionState::Connected {
                return Ok(());
            }
            session.cmd_tx.clone()
        };

        if let Some(tx) = tx {
            let _ = tx.send(SessionCommand::Resize { cols, rows }).await;
        }
        Ok(())
    }

    pub async fn disconnect_session(&self, session_id: &str) -> AppResult<()> {
        let (cmd_tx, cancel_tx) = {
            let mut guard = self.sessions.write().await;
            if let Some(session) = guard.get_mut(session_id) {
                (session.cmd_tx.take(), session.cancel_tx.take())
            } else {
                return Ok(());
            }
        };

        update_session_state(
            &self.sessions,
            &self.sink,
            session_id,
            SessionState::Disconnecting,
            Some("Disconnecting session...".into()),
        )
        .await;

        if let Some(cancel) = cancel_tx {
            let _ = cancel.send(());
        }
        if let Some(tx) = cmd_tx {
            let _ = tx.send(SessionCommand::Disconnect).await;
        }

        Ok(())
    }

    async fn open_sftp_session(&self, session_id: &str) -> AppResult<SftpSession> {
        let shared_handle = {
            let guard = self.sessions.read().await;
            let session = guard.get(session_id).ok_or_else(|| {
                AppError::Session(format!("Active session '{session_id}' not found"))
            })?;
            if session.info.state != SessionState::Connected {
                return Err(AppError::Session(
                    "Session must be connected before using SFTP.".into(),
                ));
            }
            session
                .ssh_handle
                .clone()
                .ok_or_else(|| AppError::Session("SSH handle unavailable for SFTP.".into()))?
        };

        let init_timeout = Duration::from_secs(SFTP_INIT_TIMEOUT_SECS);
        let sftp = timeout(init_timeout, async {
            let channel = {
                let h = shared_handle.lock().await;
                h.channel_open_session().await.map_err(|e| {
                    AppError::SshProtocol(format!("Failed to open SFTP channel: {e}"))
                })?
            };

            channel
                .request_subsystem(true, "sftp")
                .await
                .map_err(|e| {
                    AppError::SshProtocol(format!("SFTP subsystem request failed: {e}"))
                })?;

            SftpSession::new(channel.into_stream()).await.map_err(|e| {
                AppError::SshProtocol(format!("SFTP session initialization failed: {e}"))
            })
        })
        .await
        .map_err(|_| AppError::ConnectionTimeout(SFTP_INIT_TIMEOUT_SECS))??;

        sftp.set_timeout(SFTP_INIT_TIMEOUT_SECS);
        Ok(sftp)
    }

    pub async fn sftp_list_dir(
        &self,
        session_id: &str,
        path: Option<String>,
    ) -> AppResult<SftpDirectoryListing> {
        let sftp = self.open_sftp_session(session_id).await?;
        let requested = path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty() && *s != "~")
            .unwrap_or(".");

        let current_path = sftp
            .canonicalize(requested)
            .await
            .unwrap_or_else(|_| requested.to_string());

        let read_dir = sftp
            .read_dir(&current_path)
            .await
            .map_err(|e| AppError::SshProtocol(format!("Failed to list '{current_path}': {e}")))?;

        let mut entries: Vec<SftpEntry> = read_dir
            .filter_map(|entry| {
                let safe_name = sanitize_remote_filename(&entry.file_name())?;
                let meta = entry.metadata();
                let kind = match entry.file_type() {
                    FileType::Dir => SftpEntryKind::Directory,
                    FileType::File => SftpEntryKind::File,
                    FileType::Symlink => SftpEntryKind::Symlink,
                    _ => SftpEntryKind::Other,
                };
                let full_path = if current_path.ends_with('/') {
                    format!("{current_path}{safe_name}")
                } else {
                    format!("{current_path}/{safe_name}")
                };
                Some(SftpEntry {
                    name: safe_name,
                    path: full_path,
                    kind,
                    size: meta.size.unwrap_or(0),
                    modified_at: meta.mtime.map(u64::from),
                    permissions: meta.permissions,
                })
            })
            .take(MAX_SFTP_DIR_ENTRIES)
            .collect();

        entries.sort_by(|a, b| match (a.kind, b.kind) {
            (SftpEntryKind::Directory, SftpEntryKind::Directory) => {
                a.name.to_lowercase().cmp(&b.name.to_lowercase())
            }
            (SftpEntryKind::Directory, _) => std::cmp::Ordering::Less,
            (_, SftpEntryKind::Directory) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        });

        let _ = sftp.close().await;

        Ok(SftpDirectoryListing {
            current_path,
            entries,
        })
    }

    pub async fn sftp_upload_file(
        &self,
        session_id: &str,
        local_path: &str,
        remote_dir: Option<String>,
    ) -> AppResult<SftpTransferResult> {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        validate_local_transfer_path(local_path)?;
        let local = Path::new(local_path);
        if !local.exists() || !local.is_file() {
            return Err(AppError::Validation(format!(
                "Local file does not exist: '{local_path}'"
            )));
        }

        let file_name = local
            .file_name()
            .and_then(|n| n.to_str())
            .and_then(sanitize_remote_filename)
            .ok_or_else(|| AppError::Validation("Invalid local file name.".into()))?;

        let sftp = self.open_sftp_session(session_id).await?;
        let target_dir_req = remote_dir
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty() && *s != "~")
            .unwrap_or(".");

        let canonical_dir = sftp
            .canonicalize(target_dir_req)
            .await
            .unwrap_or_else(|_| target_dir_req.to_string());

        let remote_path = if canonical_dir.ends_with('/') {
            format!("{canonical_dir}{file_name}")
        } else {
            format!("{canonical_dir}/{file_name}")
        };

        let mut local_file = tokio::fs::File::open(local).await.map_err(|e| {
            AppError::Validation(format!("Failed to open local file '{local_path}': {e}"))
        })?;

        let mut remote_file = sftp.create(&remote_path).await.map_err(|e| {
            AppError::SshProtocol(format!("Failed to create remote file '{remote_path}': {e}"))
        })?;

        let mut buf = vec![0u8; 64 * 1024];
        let mut total_bytes = 0u64;
        loop {
            let n = local_file.read(&mut buf).await.map_err(|e| {
                AppError::Validation(format!("Error reading local file '{local_path}': {e}"))
            })?;
            if n == 0 {
                break;
            }
            remote_file.write_all(&buf[..n]).await.map_err(|e| {
                AppError::SshProtocol(format!("Error writing remote file '{remote_path}': {e}"))
            })?;
            total_bytes += n as u64;
        }

        let _ = remote_file.flush().await;
        let _ = remote_file.shutdown().await;
        let _ = sftp.close().await;

        Ok(SftpTransferResult {
            remote_path,
            local_path: local_path.to_string(),
            bytes_transferred: total_bytes,
        })
    }

    pub async fn sftp_download_file(
        &self,
        session_id: &str,
        remote_path: &str,
        local_path: &str,
    ) -> AppResult<SftpTransferResult> {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        validate_local_transfer_path(local_path)?;
        let sftp = self.open_sftp_session(session_id).await?;
        let mut remote_file = sftp.open(remote_path).await.map_err(|e| {
            AppError::SshProtocol(format!("Failed to open remote file '{remote_path}': {e}"))
        })?;

        let mut local_file = tokio::fs::File::create(local_path).await.map_err(|e| {
            AppError::Validation(format!("Failed to create local file '{local_path}': {e}"))
        })?;

        let mut buf = vec![0u8; 64 * 1024];
        let mut total_bytes = 0u64;
        loop {
            let n = remote_file.read(&mut buf).await.map_err(|e| {
                AppError::SshProtocol(format!("Error reading remote file '{remote_path}': {e}"))
            })?;
            if n == 0 {
                break;
            }
            local_file.write_all(&buf[..n]).await.map_err(|e| {
                AppError::Validation(format!("Error writing local file '{local_path}': {e}"))
            })?;
            total_bytes += n as u64;
        }

        let _ = local_file.flush().await;
        let _ = sftp.close().await;

        Ok(SftpTransferResult {
            remote_path: remote_path.to_string(),
            local_path: local_path.to_string(),
            bytes_transferred: total_bytes,
        })
    }

    pub async fn sftp_create_dir(&self, session_id: &str, path: &str) -> AppResult<()> {
        let sftp = self.open_sftp_session(session_id).await?;
        sftp.create_dir(path).await.map_err(|e| {
            AppError::SshProtocol(format!("Failed to create directory '{path}': {e}"))
        })?;
        let _ = sftp.close().await;
        Ok(())
    }

    pub async fn sftp_delete_entry(
        &self,
        session_id: &str,
        path: &str,
        is_dir: bool,
    ) -> AppResult<()> {
        let sftp = self.open_sftp_session(session_id).await?;
        if is_dir {
            sftp.remove_dir(path).await.map_err(|e| {
                AppError::SshProtocol(format!("Failed to remove directory '{path}': {e}"))
            })?;
        } else {
            sftp.remove_file(path).await.map_err(|e| {
                AppError::SshProtocol(format!("Failed to remove file '{path}': {e}"))
            })?;
        }
        let _ = sftp.close().await;
        Ok(())
    }

    /// Initiates a new SSH session and spawns the asynchronous connection and PTY loop.
    pub async fn connect_ssh(&self, req: ConnectSshRequest) -> AppResult<SessionInfo> {
        validate_terminal_dimensions(req.cols, req.rows)?;

        let _guard = self.connect_lock.lock().await;
        let host = self.db.get_host(&req.host_id).await?;
        let settings = self.db.get_settings().await?;

        let session_id = req
            .session_id
            .clone()
            .filter(|id| !id.trim().is_empty())
            .unwrap_or_else(|| Uuid::new_v4().to_string());

        // Prevent duplicate session ID conflicts
        {
            let guard = self.sessions.read().await;
            if let Some(existing) = guard.get(&session_id) {
                if !matches!(
                    existing.info.state,
                    SessionState::Disconnected | SessionState::Failed
                ) {
                    return Err(AppError::Session(format!(
                        "Session '{session_id}' is already active."
                    )));
                }
            }
        }

        let initial_info = SessionInfo {
            session_id: session_id.clone(),
            host_id: host.id.clone(),
            host_name: host.name.clone(),
            hostname: host.hostname.clone(),
            port: host.port,
            username: host.username.clone(),
            state: SessionState::Idle,
            cols: req.cols,
            rows: req.rows,
            connected_at: None,
            error_message: None,
        };

        let (cancel_tx, cancel_rx) = oneshot::channel::<()>();

        {
            let mut guard = self.sessions.write().await;
            guard.insert(
                session_id.clone(),
                ManagedSession {
                    info: initial_info.clone(),
                    cmd_tx: None,
                    cancel_tx: Some(cancel_tx),
                    host_key_decision_tx: None,
                    ssh_handle: None,
                },
            );
        }

        update_session_state(
            &self.sessions,
            &self.sink,
            &session_id,
            SessionState::Connecting,
            Some(format!("Connecting to {}:{}...", host.hostname, host.port)),
        )
        .await;

        let manager = self.clone();
        let req_secret = req.secret.clone();
        let save_secret = req.save_secret;
        let cols = req.cols;
        let rows = req.rows;
        let session_id_clone = session_id.clone();

        tokio::spawn(async move {
            let outcome = tokio::select! {
                Ok(()) = cancel_rx => {
                    Err(AppError::Session("Connection cancelled by user.".into()))
                }
                res = manager.run_session_lifecycle(
                    &session_id_clone,
                    &host,
                    &settings,
                    cols,
                    rows,
                    req_secret,
                    save_secret,
                ) => res
            };

            if let Err(err) = outcome {
                let payload = err.to_payload();
                update_session_state(
                    &manager.sessions,
                    &manager.sink,
                    &session_id_clone,
                    SessionState::Failed,
                    Some(payload.message.clone()),
                )
                .await;

                manager.sink.emit_error(SshErrorEvent {
                    session_id: session_id_clone.clone(),
                    code: payload.code,
                    message: payload.message.clone(),
                });

                manager.sink.emit_closed(SshClosedEvent {
                    session_id: session_id_clone.clone(),
                    reason: payload.message,
                });

                let mut guard = manager.sessions.write().await;
                guard.remove(&session_id_clone);
            }
        });

        Ok( self
            .get_session_info(&session_id)
            .await
            .unwrap_or(initial_info) )
    }

    #[allow(clippy::too_many_arguments)]
    async fn run_session_lifecycle(
        &self,
        session_id: &str,
        host: &crate::models::Host,
        settings: &crate::models::AppSettings,
        cols: u16,
        rows: u16,
        ephemeral_secret: Option<String>,
        save_secret: bool,
    ) -> AppResult<()> {
        let ssh_config = Arc::new(client::Config {
            inactivity_timeout: Some(Duration::from_secs(3600)),
            keepalive_interval: Some(Duration::from_secs(
                settings.keepalive_interval_secs.clamp(5, 300),
            )),
            keepalive_max: 3,
            ..Default::default()
        });

        let handler = SshClientHandler {
            session_id: session_id.to_string(),
            hostname: host.hostname.clone(),
            port: host.port,
            db: self.db.clone(),
            sink: self.sink.clone(),
            sessions: self.sessions.clone(),
        };

        let addr_tuple = (host.hostname.as_str(), host.port);
        let connect_timeout = Duration::from_secs(settings.connection_timeout_secs.max(3));

        // Establish TCP + SSH handshake (triggers check_server_key during handshake)
        let mut handle: Handle<SshClientHandler> =
            match timeout(connect_timeout, client::connect(ssh_config, addr_tuple, handler)).await {
                Ok(Ok(h)) => h,
                Ok(Err(err)) => return Err(classify_connect_error(err, &host.hostname, host.port)),
                Err(_) => return Err(AppError::ConnectionTimeout(connect_timeout.as_secs())),
            };

        update_session_state(
            &self.sessions,
            &self.sink,
            session_id,
            SessionState::Authenticating,
            Some(format!("Authenticating as '{}'...", host.username)),
        )
        .await;

        // Resolve secret from either ephemeral input or OS Keychain (kept in Zeroizing wrapper)
        let resolved_secret: Option<Zeroizing<String>> = if let Some(ref s) = ephemeral_secret {
            if !s.is_empty() {
                Some(Zeroizing::new(s.clone()))
            } else {
                None
            }
        } else if let Some(ref cred_ref) = host.credential_reference {
            self.credentials.get_secret(cred_ref)?
        } else {
            None
        };

        // Perform authentication
        let authenticated = match host.auth_method {
            AuthMethod::Password => {
                let password = resolved_secret
                    .as_ref()
                    .map(|z| z.as_str())
                    .ok_or_else(|| {
                        AppError::AuthenticationFailed(
                            "Password is required to authenticate with this host.".into(),
                        )
                    })?;
                handle
                    .authenticate_password(&host.username, password)
                    .await
                    .map_err(|e| {
                        AppError::AuthenticationFailed(format!(
                            "Password authentication failed: {e}"
                        ))
                    })?
            }
            AuthMethod::PrivateKey => {
                let key_path_str = host
                    .private_key_path
                    .as_deref()
                    .filter(|s| !s.trim().is_empty())
                    .ok_or_else(|| {
                        AppError::InvalidPrivateKey("No private key path configured.".into())
                    })?;

                let key_pem = Zeroizing::new(
                    std::fs::read_to_string(Path::new(key_path_str)).map_err(|e| {
                        AppError::InvalidPrivateKey(format!(
                            "Unable to read private key file '{key_path_str}': {e}"
                        ))
                    })?,
                );

                let passphrase = resolved_secret.as_ref().map(|z| z.as_str());
                let key_pair = match decode_secret_key(&key_pem, passphrase) {
                    Ok(k) => Arc::new(k),
                    Err(e) => {
                        let msg = e.to_string().to_lowercase();
                        if msg.contains("encrypted")
                            || msg.contains("passphrase")
                            || msg.contains("decrypt")
                        {
                            return Err(AppError::PassphraseRequired);
                        }
                        return Err(AppError::InvalidPrivateKey(format!(
                            "Failed to decode private key: {e}"
                        )));
                    }
                };

                let key_with_alg = PrivateKeyWithHashAlg::new(key_pair, None)
                    .map_err(|e| AppError::InvalidPrivateKey(format!("Invalid key algorithm: {e}")))?;

                handle
                    .authenticate_publickey(&host.username, key_with_alg)
                    .await
                    .map_err(|e| {
                        AppError::AuthenticationFailed(format!(
                            "Public key authentication error: {e}"
                        ))
                    })?
            }
        };

        if !authenticated {
            return Err(AppError::AuthenticationFailed(match host.auth_method {
                AuthMethod::Password => "Remote server rejected password.".into(),
                AuthMethod::PrivateKey => "Remote server rejected SSH private key.".into(),
            }));
        }

        // Persist secret to OS credential manager if requested by user
        if save_secret {
            if let Some(ref secret_val) = ephemeral_secret {
                if !secret_val.is_empty() {
                    let cred_ref = host
                        .credential_reference
                        .clone()
                        .unwrap_or_else(|| format!("nexterm-host-{}", host.id));
                    self.credentials.save_secret(&cred_ref, secret_val)?;
                    if host.credential_reference.is_none() {
                        let _ = self
                            .db
                            .update_host_credential_reference(&host.id, Some(&cred_ref))
                            .await;
                    }
                }
            }
        }

        // Open session channel & allocate interactive PTY
        let mut channel = handle
            .channel_open_session()
            .await
            .map_err(|e| AppError::PtyAllocationFailed(format!("Failed to open channel: {e}")))?;

        channel
            .request_pty(
                true,
                &settings.terminal_type,
                u32::from(cols),
                u32::from(rows),
                0,
                0,
                &[],
            )
            .await
            .map_err(|e| AppError::PtyAllocationFailed(format!("PTY request failed: {e}")))?;

        channel
            .request_shell(true)
            .await
            .map_err(|e| AppError::PtyAllocationFailed(format!("Shell request failed: {e}")))?;

        // Bounded command queue for backpressure-safe input & resize
        let (cmd_tx, mut cmd_rx) = mpsc::channel::<SessionCommand>(256);
        let shared_handle = Arc::new(Mutex::new(handle));
        {
            let mut guard = self.sessions.write().await;
            if let Some(session) = guard.get_mut(session_id) {
                session.cmd_tx = Some(cmd_tx);
                session.cancel_tx = None;
                session.ssh_handle = Some(shared_handle.clone());
            }
        }

        update_session_state(
            &self.sessions,
            &self.sink,
            session_id,
            SessionState::Connected,
            Some(format!("Connected to {}:{}", host.hostname, host.port)),
        )
        .await;

        let mut close_reason = "Session closed by remote host.".to_string();
        let telemetry_enabled = settings.telemetry_enabled;
        let mut telemetry_interval = tokio::time::interval(Duration::from_secs(
            settings.telemetry_interval_secs.clamp(1, 30),
        ));
        telemetry_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        let mut prev_telemetry_sample: Option<RawLinuxSample> = None;

        // Main asynchronous I/O loop for this session
        loop {
            tokio::select! {
                Some(cmd) = cmd_rx.recv() => {
                    match cmd {
                        SessionCommand::Input(bytes) => {
                            if let Err(e) = channel.data(&bytes[..]).await {
                                close_reason = format!("Write error: {e}");
                                break;
                            }
                        }
                        SessionCommand::Resize { cols: c, rows: r } => {
                            let _ = channel.window_change(u32::from(c), u32::from(r), 0, 0).await;
                        }
                        SessionCommand::Disconnect => {
                            let _ = channel.eof().await;
                            let _ = channel.close().await;
                            let h = shared_handle.lock().await;
                            let _ = h.disconnect(Disconnect::ByApplication, "User disconnected", "en").await;
                            close_reason = "Disconnected by user.".to_string();
                            break;
                        }
                    }
                }
                _ = telemetry_interval.tick(), if telemetry_enabled => {
                    if let Ok(Some(raw_sample)) = poll_remote_telemetry(&shared_handle).await {
                        if let Some(ref prev) = prev_telemetry_sample {
                            let event = compute_telemetry_delta(session_id, prev, &raw_sample);
                            self.sink.emit_telemetry(event);
                        } else {
                            // First sample: emit immediate memory usage with 0% initial delta
                            let mem_used = raw_sample.mem_total_bytes.saturating_sub(raw_sample.mem_available_bytes);
                            let mem_pct = if raw_sample.mem_total_bytes > 0 {
                                ((mem_used as f64 / raw_sample.mem_total_bytes as f64) * 100.0) as f32
                            } else {
                                0.0
                            };
                            self.sink.emit_telemetry(SshTelemetryEvent {
                                session_id: session_id.to_string(),
                                cpu_percent: 0.0,
                                mem_used_bytes: mem_used,
                                mem_total_bytes: raw_sample.mem_total_bytes,
                                mem_percent: mem_pct.clamp(0.0, 100.0),
                                net_rx_bytes_per_sec: 0,
                                net_tx_bytes_per_sec: 0,
                            });
                        }
                        prev_telemetry_sample = Some(raw_sample);
                    }
                }
                msg = channel.wait() => {
                    match msg {
                        Some(ChannelMsg::Data { ref data }) => {
                            // Stream chunks cleanly in bounded slices (max 16 KB per event)
                            for chunk in data.chunks(16 * 1024) {
                                self.sink.emit_output(SshOutputEvent {
                                    session_id: session_id.to_string(),
                                    data_base64: BASE64_STANDARD.encode(chunk),
                                });
                            }
                        }
                        Some(ChannelMsg::ExtendedData { ref data, .. }) => {
                            for chunk in data.chunks(16 * 1024) {
                                self.sink.emit_output(SshOutputEvent {
                                    session_id: session_id.to_string(),
                                    data_base64: BASE64_STANDARD.encode(chunk),
                                });
                            }
                        }
                        Some(ChannelMsg::ExitStatus { exit_status }) => {
                            close_reason = format!("Remote shell exited with status {exit_status}.");
                        }
                        Some(ChannelMsg::Eof | ChannelMsg::Close) | None => {
                            break;
                        }
                        _ => {}
                    }
                }
            }
        }

        update_session_state(
            &self.sessions,
            &self.sink,
            session_id,
            SessionState::Disconnected,
            Some(close_reason.clone()),
        )
        .await;

        self.sink.emit_closed(SshClosedEvent {
            session_id: session_id.to_string(),
            reason: close_reason,
        });

        let mut guard = self.sessions.write().await;
        guard.remove(session_id);

        Ok(())
    }
}

fn classify_connect_error(err: AppError, hostname: &str, port: u16) -> AppError {
    match err {
        AppError::HostKeyRejected(_) => err,
        other => {
            let msg = other.to_string().to_lowercase();
            if msg.contains("refused") {
                AppError::ConnectionRefused(format!("{hostname}:{port}"))
            } else if msg.contains("dns")
                || msg.contains("resolve")
                || msg.contains("no such host")
                || msg.contains("name or service not known")
            {
                AppError::DnsFailure(hostname.to_string())
            } else {
                other
            }
        }
    }
}

impl From<russh::Error> for AppError {
    fn from(err: russh::Error) -> Self {
        let msg = err.to_string();
        let lower = msg.to_lowercase();
        if lower.contains("connection refused") || lower.contains("os error 10061") {
            AppError::ConnectionRefused(msg)
        } else if lower.contains("no such host")
            || lower.contains("failed to lookup address")
            || lower.contains("os error 11001")
        {
            AppError::DnsFailure(msg)
        } else if lower.contains("timed out") || lower.contains("timeout") {
            AppError::ConnectionTimeout(15)
        } else {
            AppError::SshProtocol(msg)
        }
    }
}

const TELEMETRY_CMD: &str = "head -n 1 /proc/stat 2>/dev/null; echo '---MEM---'; grep -E '^(MemTotal|MemAvailable|MemFree|Buffers|Cached):' /proc/meminfo 2>/dev/null; echo '---NET---'; cat /proc/net/dev 2>/dev/null";

#[derive(Debug, Clone)]
pub struct RawLinuxSample {
    pub timestamp: std::time::Instant,
    pub cpu_total: u64,
    pub cpu_idle: u64,
    pub mem_total_bytes: u64,
    pub mem_available_bytes: u64,
    pub net_rx_bytes: u64,
    pub net_tx_bytes: u64,
}

async fn poll_remote_telemetry(
    shared_handle: &Arc<Mutex<Handle<SshClientHandler>>>,
) -> AppResult<Option<RawLinuxSample>> {
    let poll_future = async {
        let mut exec_channel = {
            let h = shared_handle.lock().await;
            h.channel_open_session().await.ok()?
        };
        exec_channel.exec(true, TELEMETRY_CMD).await.ok()?;

        let mut output = Vec::with_capacity(2048);
        while let Some(msg) = exec_channel.wait().await {
            match msg {
                ChannelMsg::Data { ref data } => {
                    if output.len() + data.len() <= 32 * 1024 {
                        output.extend_from_slice(data);
                    }
                }
                ChannelMsg::Eof | ChannelMsg::Close => break,
                _ => {}
            }
        }
        let text = String::from_utf8_lossy(&output);
        parse_linux_telemetry_snapshot(&text, std::time::Instant::now())
    };

    match timeout(Duration::from_millis(1500), poll_future).await {
        Ok(res) => Ok(res),
        Err(_) => Ok(None),
    }
}

pub fn parse_linux_telemetry_snapshot(
    raw: &str,
    timestamp: std::time::Instant,
) -> Option<RawLinuxSample> {
    let mem_split: Vec<&str> = raw.split("---MEM---").collect();
    if mem_split.len() < 2 {
        return None;
    }
    let cpu_section = mem_split[0];
    let rest_split: Vec<&str> = mem_split[1].split("---NET---").collect();
    let mem_section = rest_split[0];
    let net_section = if rest_split.len() > 1 {
        rest_split[1]
    } else {
        ""
    };

    // 1. Parse /proc/stat first line: "cpu  user nice system idle iowait irq softirq steal ..."
    let mut cpu_total = 0u64;
    let mut cpu_idle = 0u64;
    for line in cpu_section.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("cpu ") {
            let parts: Vec<u64> = trimmed
                .split_whitespace()
                .skip(1)
                .filter_map(|s| s.parse::<u64>().ok())
                .collect();
            if parts.len() >= 4 {
                cpu_total = parts.iter().sum();
                cpu_idle = parts[3] + parts.get(4).copied().unwrap_or(0);
            }
            break;
        }
    }

    if cpu_total == 0 {
        return None;
    }

    // 2. Parse /proc/meminfo (values are in kB)
    let mut mem_total_kb = 0u64;
    let mut mem_avail_kb: Option<u64> = None;
    let mut mem_free_kb = 0u64;
    let mut buffers_kb = 0u64;
    let mut cached_kb = 0u64;

    for line in mem_section.lines() {
        let mut parts = line.split_whitespace();
        let Some(key) = parts.next() else { continue };
        let Some(val_str) = parts.next() else { continue };
        let Ok(val) = val_str.parse::<u64>() else { continue };
        match key {
            "MemTotal:" => mem_total_kb = val,
            "MemAvailable:" => mem_avail_kb = Some(val),
            "MemFree:" => mem_free_kb = val,
            "Buffers:" => buffers_kb = val,
            "Cached:" => cached_kb = val,
            _ => {}
        }
    }

    let resolved_avail_kb = mem_avail_kb.unwrap_or(mem_free_kb + buffers_kb + cached_kb);

    // 3. Parse /proc/net/dev (sum non-loopback interfaces)
    let mut net_rx_bytes = 0u64;
    let mut net_tx_bytes = 0u64;
    for line in net_section.lines() {
        let Some((iface, stats)) = line.split_once(':') else {
            continue;
        };
        let iface_name = iface.trim();
        if iface_name == "lo" || iface_name.is_empty() {
            continue;
        }
        let cols: Vec<u64> = stats
            .split_whitespace()
            .filter_map(|s| s.parse::<u64>().ok())
            .collect();
        if cols.len() >= 9 {
            net_rx_bytes = net_rx_bytes.saturating_add(cols[0]);
            net_tx_bytes = net_tx_bytes.saturating_add(cols[8]);
        }
    }

    Some(RawLinuxSample {
        timestamp,
        cpu_total,
        cpu_idle,
        mem_total_bytes: mem_total_kb * 1024,
        mem_available_bytes: resolved_avail_kb * 1024,
        net_rx_bytes,
        net_tx_bytes,
    })
}

pub fn compute_telemetry_delta(
    session_id: &str,
    prev: &RawLinuxSample,
    curr: &RawLinuxSample,
) -> SshTelemetryEvent {
    let total_delta = curr.cpu_total.saturating_sub(prev.cpu_total);
    let idle_delta = curr.cpu_idle.saturating_sub(prev.cpu_idle);
    let cpu_percent = if total_delta > 0 {
        let busy = total_delta.saturating_sub(idle_delta);
        ((busy as f64 / total_delta as f64) * 100.0) as f32
    } else {
        0.0
    };

    let mem_used_bytes = curr
        .mem_total_bytes
        .saturating_sub(curr.mem_available_bytes);
    let mem_percent = if curr.mem_total_bytes > 0 {
        ((mem_used_bytes as f64 / curr.mem_total_bytes as f64) * 100.0) as f32
    } else {
        0.0
    };

    let elapsed_secs = curr
        .timestamp
        .saturating_duration_since(prev.timestamp)
        .as_secs_f64()
        .max(0.2);

    let rx_delta = curr.net_rx_bytes.saturating_sub(prev.net_rx_bytes);
    let tx_delta = curr.net_tx_bytes.saturating_sub(prev.net_tx_bytes);

    SshTelemetryEvent {
        session_id: session_id.to_string(),
        cpu_percent: cpu_percent.clamp(0.0, 100.0),
        mem_used_bytes,
        mem_total_bytes: curr.mem_total_bytes,
        mem_percent: mem_percent.clamp(0.0, 100.0),
        net_rx_bytes_per_sec: (rx_delta as f64 / elapsed_secs) as u64,
        net_tx_bytes_per_sec: (tx_delta as f64 / elapsed_secs) as u64,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_and_compute_linux_telemetry() {
        let t0 = std::time::Instant::now();
        let raw_1 = "\
cpu  1000 0 500 8500 0 0 0 0 0 0
---MEM---
MemTotal:        8192000 kB
MemFree:         2048000 kB
MemAvailable:    6144000 kB
---NET---
Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo:   50000     100    0    0    0     0          0         0    50000     100    0    0    0     0       0          0
  eth0: 1000000    1000    0    0    0     0          0         0   500000     500    0    0    0     0       0          0
";
        let raw_2 = "\
cpu  1250 0 550 8700 0 0 0 0 0 0
---MEM---
MemTotal:        8192000 kB
MemFree:         1024000 kB
MemAvailable:    4096000 kB
---NET---
  eth0: 1204800    1200    0    0    0     0          0         0   540960     550    0    0    0     0       0          0
";
        let s1 = parse_linux_telemetry_snapshot(raw_1, t0).unwrap();
        let s2 = parse_linux_telemetry_snapshot(raw_2, t0 + Duration::from_secs(2)).unwrap();
        let delta = compute_telemetry_delta("sess-1", &s1, &s2);

        // Total delta = 10500 - 10000 = 500; Idle delta = 8700 - 8500 = 200; Busy = 300 -> 60%
        assert!((delta.cpu_percent - 60.0).abs() < 0.1);
        // Mem used = 8192000 - 4096000 kB = 50%
        assert!((delta.mem_percent - 50.0).abs() < 0.1);
        // Net RX = (1204800 - 1000000) / 2s = 102400 B/s
        assert_eq!(delta.net_rx_bytes_per_sec, 102400);
        // Net TX = (540960 - 500000) / 2s = 20480 B/s
        assert_eq!(delta.net_tx_bytes_per_sec, 20480);
    }
}
