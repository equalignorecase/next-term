use serde::Serialize;
use thiserror::Error;

/// Unified application error type.
/// Security note: Error variants must NEVER embed raw passwords, private keys, or passphrases.
#[derive(Debug, Error)]
pub enum AppError {
    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Host not found: {0}")]
    NotFound(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Credential storage error: {0}")]
    CredentialStorage(String),

    #[error("DNS or hostname resolution failed for '{0}'")]
    DnsFailure(String),

    #[error("Connection timed out after {0} seconds")]
    ConnectionTimeout(u64),

    #[error("Connection refused by remote host {0}")]
    ConnectionRefused(String),

    #[error("Authentication failed: {0}")]
    AuthenticationFailed(String),

    #[error("Invalid SSH private key: {0}")]
    InvalidPrivateKey(String),

    #[error("Passphrase required or incorrect for encrypted private key")]
    PassphraseRequired,

    #[error("Host key verification rejected: {0}")]
    HostKeyRejected(String),

    #[error("Session error: {0}")]
    Session(String),

    #[error("Remote PTY allocation failed: {0}")]
    PtyAllocationFailed(String),

    #[error("Network or SSH protocol error: {0}")]
    SshProtocol(String),
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        match err {
            sqlx::Error::RowNotFound => AppError::NotFound("Requested record does not exist".into()),
            other => AppError::Database(other.to_string()),
        }
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ErrorPayload {
    pub code: String,
    pub message: String,
}

impl AppError {
    pub fn code(&self) -> &'static str {
        match self {
            AppError::Validation(_) => "VALIDATION_ERROR",
            AppError::NotFound(_) => "NOT_FOUND",
            AppError::Database(_) => "DATABASE_ERROR",
            AppError::CredentialStorage(_) => "CREDENTIAL_STORAGE_ERROR",
            AppError::DnsFailure(_) => "DNS_FAILURE",
            AppError::ConnectionTimeout(_) => "CONNECTION_TIMEOUT",
            AppError::ConnectionRefused(_) => "CONNECTION_REFUSED",
            AppError::AuthenticationFailed(_) => "AUTHENTICATION_FAILED",
            AppError::InvalidPrivateKey(_) => "INVALID_PRIVATE_KEY",
            AppError::PassphraseRequired => "PASSPHRASE_REQUIRED",
            AppError::HostKeyRejected(_) => "HOST_KEY_REJECTED",
            AppError::Session(_) => "SESSION_ERROR",
            AppError::PtyAllocationFailed(_) => "PTY_ALLOCATION_FAILED",
            AppError::SshProtocol(_) => "SSH_PROTOCOL_ERROR",
        }
    }

    pub fn to_payload(&self) -> ErrorPayload {
        ErrorPayload {
            code: self.code().to_string(),
            message: self.to_string(),
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.to_payload().serialize(serializer)
    }
}

pub type AppResult<T> = Result<T, AppError>;

