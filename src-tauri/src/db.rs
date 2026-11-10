use std::path::Path;
use std::str::FromStr;

use chrono::Utc;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::{AppSettings, AuthMethod, Host, HostGroup, HostInput, KnownHost};
use crate::validation::{validate_host_input, validate_settings};

#[derive(Clone)]
pub struct Database {
    pool: SqlitePool,
}

impl Database {
    pub async fn connect(db_path: &Path) -> AppResult<Self> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                AppError::Database(format!("Failed to create database directory: {e}"))
            })?;
        }

        let db_url = format!("sqlite://{}", db_path.to_string_lossy().replace('\\', "/"));
        let options = SqliteConnectOptions::from_str(&db_url)
            .map_err(|e| AppError::Database(format!("Invalid SQLite connection string: {e}")))?
            .create_if_missing(true)
            .foreign_keys(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await?;

        let db = Self { pool };
        db.run_migrations().await?;
        Ok(db)
    }

    pub async fn connect_in_memory() -> AppResult<Self> {
        let options = SqliteConnectOptions::from_str("sqlite::memory:")
            .map_err(|e| AppError::Database(e.to_string()))?
            .foreign_keys(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await?;

        let db = Self { pool };
        db.run_migrations().await?;
        Ok(db)
    }

    pub async fn run_migrations(&self) -> AppResult<()> {
        sqlx::migrate!("./migrations")
            .run(&self.pool)
            .await
            .map_err(|e| AppError::Database(format!("Database migration failed: {e}")))?;
        Ok(())
    }

    // ==================== HOST GROUPS ====================

    pub async fn list_groups(&self) -> AppResult<Vec<HostGroup>> {
        let rows = sqlx::query("SELECT id, name, sort_order FROM host_groups ORDER BY sort_order ASC, name ASC")
            .fetch_all(&self.pool)
            .await?;

        let mut groups = Vec::with_capacity(rows.len());
        for row in rows {
            groups.push(HostGroup {
                id: row.try_get("id")?,
                name: row.try_get("name")?,
                sort_order: row.try_get("sort_order")?,
            });
        }
        Ok(groups)
    }

    pub async fn create_group(&self, name: &str, sort_order: i64) -> AppResult<HostGroup> {
        let trimmed = name.trim();
        if trimmed.is_empty() || trimmed.len() > 64 {
            return Err(AppError::Validation(
                "Group name must be between 1 and 64 characters.".into(),
            ));
        }
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO host_groups (id, name, sort_order) VALUES (?1, ?2, ?3)")
            .bind(&id)
            .bind(trimmed)
            .bind(sort_order)
            .execute(&self.pool)
            .await?;

        Ok(HostGroup {
            id,
            name: trimmed.to_string(),
            sort_order,
        })
    }

    pub async fn delete_group(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM host_groups WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // ==================== HOSTS ====================

    pub async fn list_hosts(&self) -> AppResult<Vec<Host>> {
        let rows = sqlx::query(
            "SELECT id, name, hostname, port, username, auth_method, credential_reference, \
             private_key_path, group_id, description, tags, created_at, updated_at \
             FROM hosts ORDER BY name COLLATE NOCASE ASC",
        )
        .fetch_all(&self.pool)
        .await?;

        let mut hosts = Vec::with_capacity(rows.len());
        for row in rows {
            hosts.push(self.row_to_host(row)?);
        }
        Ok(hosts)
    }

    pub async fn get_host(&self, id: &str) -> AppResult<Host> {
        let row = sqlx::query(
            "SELECT id, name, hostname, port, username, auth_method, credential_reference, \
             private_key_path, group_id, description, tags, created_at, updated_at \
             FROM hosts WHERE id = ?1",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Host with ID '{id}' not found")))?;

        self.row_to_host(row)
    }

    pub async fn create_host(
        &self,
        input: &HostInput,
        credential_reference: Option<String>,
    ) -> AppResult<Host> {
        validate_host_input(input)?;

        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        let tags_vec = input.tags.clone().unwrap_or_default();
        let tags_json = serde_json::to_string(&tags_vec)
            .map_err(|e| AppError::Validation(format!("Invalid tags format: {e}")))?;
        let description = input.description.clone().unwrap_or_default();
        let private_key_path = input
            .private_key_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(String::from);
        let group_id = input
            .group_id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(String::from);

        sqlx::query(
            "INSERT INTO hosts (id, name, hostname, port, username, auth_method, \
             credential_reference, private_key_path, group_id, description, tags, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        )
        .bind(&id)
        .bind(input.name.trim())
        .bind(input.hostname.trim())
        .bind(i64::from(input.port))
        .bind(input.username.trim())
        .bind(input.auth_method.as_str())
        .bind(&credential_reference)
        .bind(&private_key_path)
        .bind(&group_id)
        .bind(&description)
        .bind(&tags_json)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        self.get_host(&id).await
    }

    pub async fn update_host(
        &self,
        id: &str,
        input: &HostInput,
        credential_reference: Option<String>,
    ) -> AppResult<Host> {
        validate_host_input(input)?;
        let _existing = self.get_host(id).await?;

        let now = Utc::now().to_rfc3339();
        let tags_vec = input.tags.clone().unwrap_or_default();
        let tags_json = serde_json::to_string(&tags_vec)
            .map_err(|e| AppError::Validation(format!("Invalid tags format: {e}")))?;
        let description = input.description.clone().unwrap_or_default();
        let private_key_path = input
            .private_key_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(String::from);
        let group_id = input
            .group_id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(String::from);

        sqlx::query(
            "UPDATE hosts SET name = ?1, hostname = ?2, port = ?3, username = ?4, \
             auth_method = ?5, credential_reference = ?6, private_key_path = ?7, \
             group_id = ?8, description = ?9, tags = ?10, updated_at = ?11 \
             WHERE id = ?12",
        )
        .bind(input.name.trim())
        .bind(input.hostname.trim())
        .bind(i64::from(input.port))
        .bind(input.username.trim())
        .bind(input.auth_method.as_str())
        .bind(&credential_reference)
        .bind(&private_key_path)
        .bind(&group_id)
        .bind(&description)
        .bind(&tags_json)
        .bind(&now)
        .bind(id)
        .execute(&self.pool)
        .await?;

        self.get_host(id).await
    }

    pub async fn update_host_credential_reference(
        &self,
        id: &str,
        credential_reference: Option<&str>,
    ) -> AppResult<()> {
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE hosts SET credential_reference = ?1, updated_at = ?2 WHERE id = ?3")
            .bind(credential_reference)
            .bind(&now)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn delete_host(&self, id: &str) -> AppResult<Host> {
        let existing = self.get_host(id).await?;
        sqlx::query("DELETE FROM hosts WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(existing)
    }

    fn row_to_host(&self, row: sqlx::sqlite::SqliteRow) -> AppResult<Host> {
        let auth_str: String = row.try_get("auth_method")?;
        let auth_method = AuthMethod::from_str(&auth_str).ok_or_else(|| {
            AppError::Database(format!("Unknown auth_method in database: {auth_str}"))
        })?;
        let port_i64: i64 = row.try_get("port")?;
        let port = u16::try_from(port_i64)
            .map_err(|_| AppError::Database(format!("Invalid port in database: {port_i64}")))?;
        let tags_raw: String = row.try_get("tags")?;
        let tags: Vec<String> = serde_json::from_str(&tags_raw).unwrap_or_default();

        Ok(Host {
            id: row.try_get("id")?,
            name: row.try_get("name")?,
            hostname: row.try_get("hostname")?,
            port,
            username: row.try_get("username")?,
            auth_method,
            credential_reference: row.try_get("credential_reference")?,
            private_key_path: row.try_get("private_key_path")?,
            group_id: row.try_get("group_id")?,
            description: row.try_get("description")?,
            tags,
            created_at: row.try_get("created_at")?,
            updated_at: row.try_get("updated_at")?,
        })
    }

    // ==================== KNOWN HOSTS ====================

    pub async fn get_known_host(&self, host_identity: &str) -> AppResult<Option<KnownHost>> {
        let row = sqlx::query(
            "SELECT id, host_identity, key_algorithm, public_key, fingerprint, trusted_at \
             FROM known_hosts WHERE host_identity = ?1",
        )
        .bind(host_identity)
        .fetch_optional(&self.pool)
        .await?;

        if let Some(row) = row {
            Ok(Some(KnownHost {
                id: row.try_get("id")?,
                host_identity: row.try_get("host_identity")?,
                key_algorithm: row.try_get("key_algorithm")?,
                public_key: row.try_get("public_key")?,
                fingerprint: row.try_get("fingerprint")?,
                trusted_at: row.try_get("trusted_at")?,
            }))
        } else {
            Ok(None)
        }
    }

    pub async fn list_known_hosts(&self) -> AppResult<Vec<KnownHost>> {
        let rows = sqlx::query(
            "SELECT id, host_identity, key_algorithm, public_key, fingerprint, trusted_at \
             FROM known_hosts ORDER BY host_identity ASC",
        )
        .fetch_all(&self.pool)
        .await?;

        let mut list = Vec::with_capacity(rows.len());
        for row in rows {
            list.push(KnownHost {
                id: row.try_get("id")?,
                host_identity: row.try_get("host_identity")?,
                key_algorithm: row.try_get("key_algorithm")?,
                public_key: row.try_get("public_key")?,
                fingerprint: row.try_get("fingerprint")?,
                trusted_at: row.try_get("trusted_at")?,
            });
        }
        Ok(list)
    }

    pub async fn upsert_known_host(
        &self,
        host_identity: &str,
        key_algorithm: &str,
        public_key: &str,
        fingerprint: &str,
    ) -> AppResult<KnownHost> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        sqlx::query(
            "INSERT INTO known_hosts (id, host_identity, key_algorithm, public_key, fingerprint, trusted_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
             ON CONFLICT(host_identity) DO UPDATE SET \
             key_algorithm = excluded.key_algorithm, \
             public_key = excluded.public_key, \
             fingerprint = excluded.fingerprint, \
             trusted_at = excluded.trusted_at",
        )
        .bind(&id)
        .bind(host_identity)
        .bind(key_algorithm)
        .bind(public_key)
        .bind(fingerprint)
        .bind(&now)
        .execute(&self.pool)
        .await?;

        self.get_known_host(host_identity)
            .await?
            .ok_or_else(|| AppError::Database("Failed to read upserted known_host".into()))
    }

    pub async fn delete_known_host(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM known_hosts WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // ==================== SETTINGS ====================

    pub async fn get_settings(&self) -> AppResult<AppSettings> {
        let row = sqlx::query("SELECT value FROM settings WHERE key = 'app_settings'")
            .fetch_optional(&self.pool)
            .await?;

        if let Some(row) = row {
            let val: String = row.try_get("value")?;
            let parsed: AppSettings = serde_json::from_str(&val).unwrap_or_default();
            Ok(parsed)
        } else {
            Ok(AppSettings::default())
        }
    }

    pub async fn update_settings(&self, settings: &AppSettings) -> AppResult<AppSettings> {
        validate_settings(settings)?;
        let json = serde_json::to_string(settings)
            .map_err(|e| AppError::Validation(format!("Failed to serialize settings: {e}")))?;

        sqlx::query(
            "INSERT INTO settings (key, value) VALUES ('app_settings', ?1) \
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        )
        .bind(&json)
        .execute(&self.pool)
        .await?;

        Ok(settings.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_host_crud_and_groups() {
        let db = Database::connect_in_memory().await.unwrap();

        let group = db.create_group("Production", 1).await.unwrap();
        assert_eq!(group.name, "Production");

        let input = HostInput {
            name: "Web Server 01".into(),
            hostname: "10.0.1.15".into(),
            port: 2222,
            username: "deploy".into(),
            auth_method: AuthMethod::Password,
            private_key_path: None,
            group_id: Some(group.id.clone()),
            description: Some("Primary nginx node".into()),
            tags: Some(vec!["prod".into(), "web".into()]),
            secret: None,
            save_secret: false,
        };

        let created = db
            .create_host(&input, Some("cred-ref-123".into()))
            .await
            .unwrap();
        assert_eq!(created.name, "Web Server 01");
        assert_eq!(created.port, 2222);
        assert_eq!(created.credential_reference.as_deref(), Some("cred-ref-123"));
        assert_eq!(created.tags, vec!["prod", "web"]);

        let hosts = db.list_hosts().await.unwrap();
        assert_eq!(hosts.len(), 1);

        let mut updated_input = input.clone();
        updated_input.name = "Web Server 01 Updated".into();
        let updated = db
            .update_host(&created.id, &updated_input, Some("cred-ref-123".into()))
            .await
            .unwrap();
        assert_eq!(updated.name, "Web Server 01 Updated");

        db.delete_host(&created.id).await.unwrap();
        assert!(db.list_hosts().await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_known_hosts_trust_store() {
        let db = Database::connect_in_memory().await.unwrap();
        let identity = "[10.0.0.1]:2222";

        assert!(db.get_known_host(identity).await.unwrap().is_none());

        let saved = db
            .upsert_known_host(identity, "ssh-ed25519", "AAAA...", "SHA256:xyz")
            .await
            .unwrap();
        assert_eq!(saved.fingerprint, "SHA256:xyz");

        // Replace existing key
        let updated = db
            .upsert_known_host(identity, "ssh-ed25519", "BBBB...", "SHA256:abc")
            .await
            .unwrap();
        assert_eq!(updated.fingerprint, "SHA256:abc");

        db.delete_known_host(&updated.id).await.unwrap();
        assert!(db.get_known_host(identity).await.unwrap().is_none());
    }

    #[tokio::test]
    async fn test_settings_persistence() {
        let db = Database::connect_in_memory().await.unwrap();
        let defaults = db.get_settings().await.unwrap();
        assert_eq!(defaults.default_ssh_port, 22);

        let mut custom = defaults.clone();
        custom.terminal_font_size = 16;
        custom.connection_timeout_secs = 30;
        db.update_settings(&custom).await.unwrap();

        let loaded = db.get_settings().await.unwrap();
        assert_eq!(loaded.terminal_font_size, 16);
        assert_eq!(loaded.connection_timeout_secs, 30);
    }
}

