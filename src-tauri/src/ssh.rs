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
    SessionInfo, SessionState, SshClosedEvent, SshErrorEvent, SshOutputEvent, SshStatusEvent,
};
use crate::validation::{format_host_identity, validate_terminal_dimensions};

/// Event emitter abstraction so `SessionManager` works in both Tauri runtime and headless Rust integration tests.
pub trait SessionEventSink: Send + Sync {
    fn emit_status(&self, event: SshStatusEvent);
    fn emit_output(&self, event: SshOutputEvent);
    fn emit_error(&self, event: SshErrorEvent);
    fn emit_closed(&self, event: SshClosedEvent);
    fn emit_host_key_challenge(&self, event: HostKeyChallengeEvent);
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
            keepalive_interval: Some(Duration::from_secs(30)),
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

        // Resolve secret from either ephemeral input or OS Keychain
        let resolved_secret: Option<String> = if let Some(ref s) = ephemeral_secret {
            if !s.is_empty() {
                Some(s.clone())
            } else {
                None
            }
        } else if let Some(ref cred_ref) = host.credential_reference {
            self.credentials
                .get_secret(cred_ref)?
                .map(|z| z.as_str().to_string())
        } else {
            None
        };

        // Perform authentication
        let authenticated = match host.auth_method {
            AuthMethod::Password => {
                let password = resolved_secret.as_deref().ok_or_else(|| {
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

                let key_pem = std::fs::read_to_string(Path::new(key_path_str)).map_err(|e| {
                    AppError::InvalidPrivateKey(format!(
                        "Unable to read private key file '{key_path_str}': {e}"
                    ))
                })?;

                let key_pair = match decode_secret_key(&key_pem, resolved_secret.as_deref()) {
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
        {
            let mut guard = self.sessions.write().await;
            if let Some(session) = guard.get_mut(session_id) {
                session.cmd_tx = Some(cmd_tx);
                session.cancel_tx = None;
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
                            let _ = handle.disconnect(Disconnect::ByApplication, "User disconnected", "en").await;
                            close_reason = "Disconnected by user.".to_string();
                            break;
                        }
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
