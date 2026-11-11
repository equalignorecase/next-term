use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthMethod {
    Password,
    PrivateKey,
}

impl AuthMethod {
    pub fn as_str(&self) -> &'static str {
        match self {
            AuthMethod::Password => "password",
            AuthMethod::PrivateKey => "private_key",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "password" => Some(AuthMethod::Password),
            "private_key" => Some(AuthMethod::PrivateKey),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Host {
    pub id: String,
    pub name: String,
    pub hostname: String,
    pub port: u16,
    pub username: String,
    pub auth_method: AuthMethod,
    pub credential_reference: Option<String>,
    pub private_key_path: Option<String>,
    pub group_id: Option<String>,
    pub description: String,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostInput {
    pub name: String,
    pub hostname: String,
    pub port: u16,
    pub username: String,
    pub auth_method: AuthMethod,
    pub private_key_path: Option<String>,
    pub group_id: Option<String>,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    /// Optional secret (password or key passphrase) to save into OS Keychain if `save_secret` is true
    pub secret: Option<String>,
    pub save_secret: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostGroup {
    pub id: String,
    pub name: String,
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownHost {
    pub id: String,
    pub host_identity: String,
    pub key_algorithm: String,
    pub public_key: String,
    pub fingerprint: String,
    pub trusted_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum SessionState {
    Idle,
    Connecting,
    VerifyingHost,
    Authenticating,
    Connected,
    Disconnecting,
    Disconnected,
    Failed,
}

impl SessionState {
    /// Enforces valid state transitions in the SSH lifecycle
    pub fn can_transition_to(&self, next: SessionState) -> bool {
        use SessionState::*;
        match (self, next) {
            (Idle, Connecting) => true,
            (Connecting, VerifyingHost | Disconnecting | Disconnected | Failed) => true,
            (VerifyingHost, Authenticating | Disconnecting | Disconnected | Failed) => true,
            (Authenticating, Connected | Disconnecting | Disconnected | Failed) => true,
            (Connected, Disconnecting | Disconnected | Failed) => true,
            (Disconnecting, Disconnected | Failed) => true,
            _ => false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub session_id: String,
    pub host_id: String,
    pub host_name: String,
    pub hostname: String,
    pub port: u16,
    pub username: String,
    pub state: SessionState,
    pub cols: u16,
    pub rows: u16,
    pub connected_at: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectSshRequest {
    pub session_id: Option<String>,
    pub host_id: String,
    pub cols: u16,
    pub rows: u16,
    /// Ephemeral password or key passphrase supplied for this session
    pub secret: Option<String>,
    /// Whether to persist the supplied secret to the OS credential store
    pub save_secret: bool,
}

impl Drop for ConnectSshRequest {
    fn drop(&mut self) {
        if let Some(ref mut s) = self.secret {
            s.zeroize();
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HostKeyStatus {
    Unknown,
    Changed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostKeyChallengeEvent {
    pub session_id: String,
    pub host_identity: String,
    pub hostname: String,
    pub port: u16,
    pub key_algorithm: String,
    pub fingerprint: String,
    pub public_key_base64: String,
    pub status: HostKeyStatus,
    pub previous_fingerprint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostKeyDecision {
    pub session_id: String,
    pub trust: bool,
    /// Whether to persist the key in SQLite `known_hosts` (or replace if changed)
    pub persist: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshStatusEvent {
    pub session_id: String,
    pub state: SessionState,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshOutputEvent {
    pub session_id: String,
    /// Base64-encoded raw terminal bytes for safe UTF-8 / binary ANSI transport
    pub data_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshErrorEvent {
    pub session_id: String,
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshClosedEvent {
    pub session_id: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshTelemetryEvent {
    pub session_id: String,
    pub cpu_percent: f32,
    pub mem_used_bytes: u64,
    pub mem_total_bytes: u64,
    pub mem_percent: f32,
    pub net_rx_bytes_per_sec: u64,
    pub net_tx_bytes_per_sec: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SftpEntryKind {
    File,
    Directory,
    Symlink,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpEntry {
    pub name: String,
    pub path: String,
    pub kind: SftpEntryKind,
    pub size: u64,
    pub modified_at: Option<u64>,
    pub permissions: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpDirectoryListing {
    pub current_path: String,
    pub entries: Vec<SftpEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpTransferResult {
    pub remote_path: String,
    pub local_path: String,
    pub bytes_transferred: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppSettings {
    pub theme: String,
    pub accent_color: String,
    pub terminal_font_family: String,
    pub terminal_font_size: u16,
    pub terminal_line_height: f32,
    pub terminal_padding: u16,
    pub cursor_style: String,
    pub cursor_blink: bool,
    pub scrollback: u32,
    pub copy_on_select: bool,
    pub right_click_behavior: String,
    pub enable_bell: bool,
    pub connection_timeout_secs: u64,
    pub keepalive_interval_secs: u64,
    pub telemetry_enabled: bool,
    pub telemetry_interval_secs: u64,
    pub ui_density: String,
    pub terminal_type: String,
    pub default_ssh_port: u16,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "obsidian".to_string(),
            accent_color: "#10B981".to_string(),
            terminal_font_family: "JetBrains Mono, Cascadia Code, Consolas, monospace".to_string(),
            terminal_font_size: 14,
            terminal_line_height: 1.25,
            terminal_padding: 8,
            cursor_style: "block".to_string(),
            cursor_blink: true,
            scrollback: 5000,
            copy_on_select: false,
            right_click_behavior: "context_menu".to_string(),
            enable_bell: false,
            connection_timeout_secs: 15,
            keepalive_interval_secs: 30,
            telemetry_enabled: true,
            telemetry_interval_secs: 2,
            ui_density: "compact".to_string(),
            terminal_type: "xterm-256color".to_string(),
            default_ssh_port: 22,
        }
    }
}

