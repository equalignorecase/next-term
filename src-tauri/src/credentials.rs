use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use keyring::Entry;
use zeroize::Zeroizing;

use crate::error::{AppError, AppResult};

const SERVICE_NAME: &str = "dev.nexterm.app.credentials";

/// Abstraction for secure OS credential storage.
/// Secrets are never logged or returned to the frontend via generic IPC commands.
pub trait CredentialStore: Send + Sync {
    fn save_secret(&self, reference_id: &str, secret: &str) -> AppResult<()>;
    fn get_secret(&self, reference_id: &str) -> AppResult<Option<Zeroizing<String>>>;
    fn delete_secret(&self, reference_id: &str) -> AppResult<()>;
}

pub struct OsCredentialStore;

impl OsCredentialStore {
    pub fn new() -> Self {
        Self
    }
}

impl Default for OsCredentialStore {
    fn default() -> Self {
        Self::new()
    }
}

impl CredentialStore for OsCredentialStore {
    fn save_secret(&self, reference_id: &str, secret: &str) -> AppResult<()> {
        if reference_id.trim().is_empty() {
            return Err(AppError::Validation(
                "Credential reference ID cannot be empty.".into(),
            ));
        }
        let entry = Entry::new(SERVICE_NAME, reference_id)
            .map_err(|e| AppError::CredentialStorage(format!("Failed to initialize OS keychain entry: {e}")))?;
        entry
            .set_password(secret)
            .map_err(|e| AppError::CredentialStorage(format!("Failed to store secret in OS keychain: {e}")))?;
        Ok(())
    }

    fn get_secret(&self, reference_id: &str) -> AppResult<Option<Zeroizing<String>>> {
        if reference_id.trim().is_empty() {
            return Ok(None);
        }
        let entry = Entry::new(SERVICE_NAME, reference_id)
            .map_err(|e| AppError::CredentialStorage(format!("Failed to initialize OS keychain entry: {e}")))?;
        match entry.get_password() {
            Ok(secret) => Ok(Some(Zeroizing::new(secret))),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(AppError::CredentialStorage(format!(
                "Failed to read secret from OS keychain: {e}"
            ))),
        }
    }

    fn delete_secret(&self, reference_id: &str) -> AppResult<()> {
        if reference_id.trim().is_empty() {
            return Ok(());
        }
        let entry = Entry::new(SERVICE_NAME, reference_id)
            .map_err(|e| AppError::CredentialStorage(format!("Failed to initialize OS keychain entry: {e}")))?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(AppError::CredentialStorage(format!(
                "Failed to delete secret from OS keychain: {e}"
            ))),
        }
    }
}

/// Isolated in-memory credential store used strictly in automated tests so tests
/// never pollute or depend on a developer's real OS Keychain.
#[derive(Default, Clone)]
pub struct MemoryCredentialStore {
    inner: Arc<Mutex<HashMap<String, Zeroizing<String>>>>,
}

impl MemoryCredentialStore {
    pub fn new() -> Self {
        Self::default()
    }
}

impl CredentialStore for MemoryCredentialStore {
    fn save_secret(&self, reference_id: &str, secret: &str) -> AppResult<()> {
        if reference_id.trim().is_empty() {
            return Err(AppError::Validation(
                "Credential reference ID cannot be empty.".into(),
            ));
        }
        let mut guard = self.inner.lock().unwrap();
        guard.insert(
            reference_id.to_string(),
            Zeroizing::new(secret.to_string()),
        );
        Ok(())
    }

    fn get_secret(&self, reference_id: &str) -> AppResult<Option<Zeroizing<String>>> {
        let guard = self.inner.lock().unwrap();
        Ok(guard.get(reference_id).cloned())
    }

    fn delete_secret(&self, reference_id: &str) -> AppResult<()> {
        let mut guard = self.inner.lock().unwrap();
        guard.remove(reference_id);
        Ok(())
    }
}

