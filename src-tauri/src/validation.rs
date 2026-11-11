use std::net::IpAddr;
use std::path::{Component, Path};

use crate::error::{AppError, AppResult};
use crate::models::{AppSettings, AuthMethod, HostInput};

pub fn validate_host_input(input: &HostInput) -> AppResult<()> {
    let name = input.name.trim();
    if name.is_empty() || name.len() > 128 {
        return Err(AppError::Validation(
            "Display name must be between 1 and 128 characters.".into(),
        ));
    }

    validate_hostname(&input.hostname)?;
    validate_port(input.port)?;

    let username = input.username.trim();
    if username.is_empty() || username.len() > 128 {
        return Err(AppError::Validation(
            "Username must be between 1 and 128 characters.".into(),
        ));
    }
    if username.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err(AppError::Validation(
            "Username cannot contain whitespace or control characters.".into(),
        ));
    }

    if let Some(ref desc) = input.description {
        if desc.len() > 1000 {
            return Err(AppError::Validation(
                "Description must not exceed 1000 characters.".into(),
            ));
        }
    }

    if let Some(ref tags) = input.tags {
        if tags.len() > 20 {
            return Err(AppError::Validation(
                "Maximum of 20 tags allowed per host.".into(),
            ));
        }
        for tag in tags {
            if tag.trim().is_empty() || tag.len() > 32 {
                return Err(AppError::Validation(
                    "Each tag must be between 1 and 32 characters.".into(),
                ));
            }
        }
    }

    match input.auth_method {
        AuthMethod::PrivateKey => {
            let path = input
                .private_key_path
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .ok_or_else(|| {
                    AppError::Validation(
                        "Private key path is required for private key authentication.".into(),
                    )
                })?;
            validate_private_key_path(path)?;
        }
        AuthMethod::Password => {
            if let Some(ref path) = input.private_key_path {
                if !path.trim().is_empty() {
                    validate_private_key_path(path.trim())?;
                }
            }
        }
    }

    Ok(())
}

pub fn validate_hostname(hostname: &str) -> AppResult<()> {
    let trimmed = hostname.trim();
    if trimmed.is_empty() || trimmed.len() > 253 {
        return Err(AppError::Validation(
            "Hostname or IP address must be between 1 and 253 characters.".into(),
        ));
    }

    // Valid IPv4 or IPv6
    if trimmed.parse::<IpAddr>().is_ok() {
        return Ok(());
    }

    // RFC 1123 hostname validation
    if trimmed.starts_with('.') || trimmed.ends_with('.') {
        return Err(AppError::Validation(
            "Hostname cannot start or end with a dot.".into(),
        ));
    }

    for label in trimmed.split('.') {
        if label.is_empty() || label.len() > 63 {
            return Err(AppError::Validation(
                "Invalid hostname label length.".into(),
            ));
        }
        if label.starts_with('-') || label.ends_with('-') {
            return Err(AppError::Validation(
                "Hostname labels cannot start or end with a hyphen.".into(),
            ));
        }
        if !label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
            return Err(AppError::Validation(
                "Hostname contains invalid characters.".into(),
            ));
        }
    }

    Ok(())
}

pub fn validate_port(port: u16) -> AppResult<()> {
    if port == 0 {
        return Err(AppError::Validation(
            "SSH port must be between 1 and 65535.".into(),
        ));
    }
    Ok(())
}

pub fn validate_private_key_path(path_str: &str) -> AppResult<()> {
    if path_str.is_empty() || path_str.len() > 1024 {
        return Err(AppError::Validation("Invalid private key file path.".into()));
    }
    if path_str.contains('\0') {
        return Err(AppError::Validation(
            "Private key path contains null byte.".into(),
        ));
    }
    let path = Path::new(path_str);
    if path.is_dir() {
        return Err(AppError::Validation(
            "Private key path points to a directory, not a file.".into(),
        ));
    }
    Ok(())
}

/// Validates a local file path used for SFTP upload or download.
pub fn validate_local_transfer_path(path_str: &str) -> AppResult<()> {
    let trimmed = path_str.trim();
    if trimmed.is_empty() || trimmed.len() > 1024 {
        return Err(AppError::Validation(
            "Local file path must be between 1 and 1024 characters.".into(),
        ));
    }
    if trimmed.contains('\0') {
        return Err(AppError::Validation(
            "Local file path contains null byte.".into(),
        ));
    }
    let path = Path::new(trimmed);
    if path.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(AppError::Validation(
            "Local file path must not contain parent directory traversal ('..').".into(),
        ));
    }
    if path.is_dir() {
        return Err(AppError::Validation(
            "Local transfer path points to a directory, not a file.".into(),
        ));
    }
    Ok(())
}

/// Sanitizes an untrusted filename returned by a remote SFTP server.
/// Returns `None` for `.`, `..`, empty names, or names containing path separators/control chars.
pub fn sanitize_remote_filename(name: &str) -> Option<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        return None;
    }
    if trimmed
        .chars()
        .any(|c| c == '/' || c == '\\' || c == '\0' || c.is_control())
    {
        return None;
    }
    Some(trimmed.to_string())
}

pub fn validate_terminal_dimensions(cols: u16, rows: u16) -> AppResult<()> {
    if !(10..=1000).contains(&cols) || !(2..=500).contains(&rows) {
        return Err(AppError::Validation(format!(
            "Terminal dimensions ({cols}x{rows}) are out of valid bounds (10..=1000 x 2..=500)."
        )));
    }
    Ok(())
}

pub fn validate_settings(settings: &AppSettings) -> AppResult<()> {
    let valid_themes = [
        "dark",
        "light",
        "obsidian",
        "tokyo-night",
        "catppuccin",
        "dracula",
        "nord",
        "gruvbox",
        "solarized-light",
    ];
    if !valid_themes.contains(&settings.theme.as_str()) {
        return Err(AppError::Validation(format!(
            "Unsupported theme preset '{}'.",
            settings.theme
        )));
    }

    let accent = settings.accent_color.trim();
    if accent.len() != 7
        || !accent.starts_with('#')
        || !accent[1..].chars().all(|c| c.is_ascii_hexdigit())
    {
        return Err(AppError::Validation(
            "Accent color must be a valid 6-digit hex color (e.g., #10B981).".into(),
        ));
    }

    if settings.terminal_font_family.trim().is_empty()
        || settings.terminal_font_family.len() > 256
    {
        return Err(AppError::Validation(
            "Terminal font family must be between 1 and 256 characters.".into(),
        ));
    }
    if !(8..=36).contains(&settings.terminal_font_size) {
        return Err(AppError::Validation(
            "Terminal font size must be between 8 and 36.".into(),
        ));
    }
    if !(1.0..=2.5).contains(&settings.terminal_line_height) {
        return Err(AppError::Validation(
            "Terminal line height must be between 1.0 and 2.5.".into(),
        ));
    }
    if settings.terminal_padding > 32 {
        return Err(AppError::Validation(
            "Terminal padding must be between 0 and 32 pixels.".into(),
        ));
    }
    if !matches!(settings.cursor_style.as_str(), "block" | "underline" | "bar") {
        return Err(AppError::Validation(
            "Cursor style must be 'block', 'underline', or 'bar'.".into(),
        ));
    }
    if !(100..=100_000).contains(&settings.scrollback) {
        return Err(AppError::Validation(
            "Scrollback size must be between 100 and 100,000 lines.".into(),
        ));
    }
    if !matches!(
        settings.right_click_behavior.as_str(),
        "context_menu" | "paste"
    ) {
        return Err(AppError::Validation(
            "Right-click behavior must be 'context_menu' or 'paste'.".into(),
        ));
    }
    if !(3..=300).contains(&settings.connection_timeout_secs) {
        return Err(AppError::Validation(
            "Connection timeout must be between 3 and 300 seconds.".into(),
        ));
    }
    if !(5..=300).contains(&settings.keepalive_interval_secs) {
        return Err(AppError::Validation(
            "Keepalive interval must be between 5 and 300 seconds.".into(),
        ));
    }
    if !(1..=30).contains(&settings.telemetry_interval_secs) {
        return Err(AppError::Validation(
            "Telemetry refresh interval must be between 1 and 30 seconds.".into(),
        ));
    }
    if !matches!(settings.ui_density.as_str(), "compact" | "comfortable") {
        return Err(AppError::Validation(
            "UI density must be 'compact' or 'comfortable'.".into(),
        ));
    }
    if !matches!(
        settings.terminal_type.as_str(),
        "xterm-256color" | "xterm" | "vt100"
    ) {
        return Err(AppError::Validation(
            "Terminal type must be 'xterm-256color', 'xterm', or 'vt100'.".into(),
        ));
    }
    validate_port(settings.default_ssh_port)?;
    Ok(())
}

/// Format OpenSSH-compatible host identity string for known_hosts storage
pub fn format_host_identity(hostname: &str, port: u16) -> String {
    let clean = hostname.trim().to_lowercase();
    if port == 22 {
        clean
    } else {
        format!("[{clean}]:{port}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hostname_validation() {
        assert!(validate_hostname("example.com").is_ok());
        assert!(validate_hostname("192.168.1.10").is_ok());
        assert!(validate_hostname("::1").is_ok());
        assert!(validate_hostname("prod-db-01.internal.net").is_ok());

        assert!(validate_hostname("").is_err());
        assert!(validate_hostname("-invalid.com").is_err());
        assert!(validate_hostname("invalid..com").is_err());
        assert!(validate_hostname("host with spaces").is_err());
    }

    #[test]
    fn test_format_host_identity() {
        assert_eq!(format_host_identity("Example.COM", 22), "example.com");
        assert_eq!(
            format_host_identity("10.0.0.5", 2222),
            "[10.0.0.5]:2222"
        );
    }

    #[test]
    fn test_terminal_dimensions_validation() {
        assert!(validate_terminal_dimensions(80, 24).is_ok());
        assert!(validate_terminal_dimensions(0, 24).is_err());
        assert!(validate_terminal_dimensions(80, 1).is_err());
        assert!(validate_terminal_dimensions(2000, 24).is_err());
    }

    #[test]
    fn test_sftp_path_and_filename_validation() {
        assert!(validate_local_transfer_path("C:\\Users\\admin\\report.txt").is_ok());
        assert!(validate_local_transfer_path("/tmp/archive.tar.gz").is_ok());
        assert!(validate_local_transfer_path("").is_err());
        assert!(validate_local_transfer_path("bad\0path.txt").is_err());
        assert!(validate_local_transfer_path("C:\\Users\\admin\\..\\secret.txt").is_err());
        assert!(validate_local_transfer_path("../../etc/passwd").is_err());

        assert_eq!(
            sanitize_remote_filename("nginx.conf"),
            Some("nginx.conf".to_string())
        );
        assert_eq!(sanitize_remote_filename("."), None);
        assert_eq!(sanitize_remote_filename(".."), None);
        assert_eq!(sanitize_remote_filename("../../.bashrc"), None);
        assert_eq!(sanitize_remote_filename("sub\\file.txt"), None);
        assert_eq!(sanitize_remote_filename("bad\0name"), None);
    }
}

