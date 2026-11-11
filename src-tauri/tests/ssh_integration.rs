use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use async_trait::async_trait;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use russh::keys::ssh_key::{self, rand_core::OsRng};
use russh::keys::{Algorithm, PrivateKey, PublicKey};
use russh::server::{self, Auth, Msg, Server as _, Session};
use russh::{Channel, ChannelId, CryptoVec};
use tokio::net::TcpListener;
use tokio::sync::Notify;

use nexterm_lib::credentials::MemoryCredentialStore;
use nexterm_lib::db::Database;
use nexterm_lib::models::{
    AuthMethod, ConnectSshRequest, HostInput, HostKeyChallengeEvent, HostKeyDecision,
    HostKeyStatus, SessionState, SshClosedEvent, SshErrorEvent, SshOutputEvent, SshStatusEvent,
    SshTelemetryEvent,
};
use nexterm_lib::ssh::{SessionEventSink, SessionManager};

#[derive(Default)]
struct TestEventCollector {
    statuses: Mutex<Vec<SshStatusEvent>>,
    outputs: Mutex<Vec<SshOutputEvent>>,
    errors: Mutex<Vec<SshErrorEvent>>,
    closed: Mutex<Vec<SshClosedEvent>>,
    challenges: Mutex<Vec<HostKeyChallengeEvent>>,
    telemetries: Mutex<Vec<SshTelemetryEvent>>,
    notify: Notify,
}

impl SessionEventSink for TestEventCollector {
    fn emit_status(&self, event: SshStatusEvent) {
        self.statuses.lock().unwrap().push(event);
        self.notify.notify_waiters();
    }

    fn emit_output(&self, event: SshOutputEvent) {
        self.outputs.lock().unwrap().push(event);
        self.notify.notify_waiters();
    }

    fn emit_error(&self, event: SshErrorEvent) {
        self.errors.lock().unwrap().push(event);
        self.notify.notify_waiters();
    }

    fn emit_closed(&self, event: SshClosedEvent) {
        self.closed.lock().unwrap().push(event);
        self.notify.notify_waiters();
    }

    fn emit_host_key_challenge(&self, event: HostKeyChallengeEvent) {
        self.challenges.lock().unwrap().push(event);
        self.notify.notify_waiters();
    }

    fn emit_telemetry(&self, event: SshTelemetryEvent) {
        self.telemetries.lock().unwrap().push(event);
        self.notify.notify_waiters();
    }
}

impl TestEventCollector {
    async fn wait_for_challenge(&self, session_id: &str) -> HostKeyChallengeEvent {
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                {
                    let guard = self.challenges.lock().unwrap();
                    if let Some(ev) = guard.iter().find(|c| c.session_id == session_id) {
                        return ev.clone();
                    }
                }
                self.notify.notified().await;
            }
        })
        .await
        .expect("Timed out waiting for host key challenge")
    }

    async fn wait_for_state(&self, session_id: &str, target: SessionState) {
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                {
                    let guard = self.statuses.lock().unwrap();
                    if guard
                        .iter()
                        .any(|s| s.session_id == session_id && s.state == target)
                    {
                        return;
                    }
                }
                self.notify.notified().await;
            }
        })
        .await
        .unwrap_or_else(|_| panic!("Timed out waiting for state {target:?}"));
    }

    async fn wait_for_output_containing(&self, session_id: &str, needle: &str) -> String {
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                {
                    let guard = self.outputs.lock().unwrap();
                    let mut combined = Vec::new();
                    for out in guard.iter().filter(|o| o.session_id == session_id) {
                        if let Ok(bytes) = BASE64_STANDARD.decode(&out.data_base64) {
                            combined.extend_from_slice(&bytes);
                        }
                    }
                    let text = String::from_utf8_lossy(&combined).to_string();
                    if text.contains(needle) {
                        return text;
                    }
                }
                self.notify.notified().await;
            }
        })
        .await
        .unwrap_or_else(|_| panic!("Timed out waiting for output containing '{needle}'"))
    }
}

#[derive(Clone)]
struct EmbeddedSshServer {
    expected_user: String,
    expected_password: String,
    allowed_pubkey: Option<PublicKey>,
    last_pty_dims: Arc<Mutex<HashMap<ChannelId, (u32, u32)>>>,
}

impl server::Server for EmbeddedSshServer {
    type Handler = EmbeddedSshSession;

    fn new_client(&mut self, _peer_addr: Option<std::net::SocketAddr>) -> Self::Handler {
        EmbeddedSshSession {
            expected_user: self.expected_user.clone(),
            expected_password: self.expected_password.clone(),
            allowed_pubkey: self.allowed_pubkey.clone(),
            last_pty_dims: self.last_pty_dims.clone(),
        }
    }
}

struct EmbeddedSshSession {
    expected_user: String,
    expected_password: String,
    allowed_pubkey: Option<PublicKey>,
    last_pty_dims: Arc<Mutex<HashMap<ChannelId, (u32, u32)>>>,
}

#[async_trait]
impl server::Handler for EmbeddedSshSession {
    type Error = russh::Error;

    async fn auth_password(&mut self, user: &str, password: &str) -> Result<Auth, Self::Error> {
        if user == self.expected_user && password == self.expected_password {
            Ok(Auth::Accept)
        } else {
            Ok(Auth::Reject {
                proceed_with_methods: None,
            })
        }
    }

    async fn auth_publickey(
        &mut self,
        user: &str,
        public_key: &PublicKey,
    ) -> Result<Auth, Self::Error> {
        if user == self.expected_user {
            if let Some(ref allowed) = self.allowed_pubkey {
                if allowed == public_key {
                    return Ok(Auth::Accept);
                }
            }
        }
        Ok(Auth::Reject {
            proceed_with_methods: None,
        })
    }

    async fn channel_open_session(
        &mut self,
        _channel: Channel<Msg>,
        _session: &mut Session,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }

    async fn pty_request(
        &mut self,
        channel: ChannelId,
        _term: &str,
        col_width: u32,
        row_height: u32,
        _pix_width: u32,
        _pix_height: u32,
        _modes: &[(russh::Pty, u32)],
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        self.last_pty_dims
            .lock()
            .unwrap()
            .insert(channel, (col_width, row_height));
        session.channel_success(channel)?;
        Ok(())
    }

    async fn shell_request(
        &mut self,
        channel: ChannelId,
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        session.channel_success(channel)?;
        session.data(
            channel,
            CryptoVec::from_slice(b"Welcome to NexTerm Test SSH Server\r\n$ "),
        )?;
        Ok(())
    }

    async fn exec_request(
        &mut self,
        channel: ChannelId,
        _data: &[u8],
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        session.channel_success(channel)?;
        let mock_proc = b"cpu  1200 0 400 8400 0 0 0 0 0 0\n---MEM---\nMemTotal: 8192000 kB\nMemAvailable: 6144000 kB\n---NET---\neth0: 2048000 100 0 0 0 0 0 0 1024000 50 0 0 0 0 0 0\n";
        session.data(channel, CryptoVec::from_slice(mock_proc))?;
        session.eof(channel)?;
        session.close(channel)?;
        Ok(())
    }

    async fn data(
        &mut self,
        channel: ChannelId,
        data: &[u8],
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        let input = String::from_utf8_lossy(data);
        if input.contains("exit") {
            session.exit_status_request(channel, 0)?;
            session.eof(channel)?;
            session.close(channel)?;
        } else {
            let reply = format!("ECHO:{input}");
            session.data(channel, CryptoVec::from_slice(reply.as_bytes()))?;
        }
        Ok(())
    }

    async fn window_change_request(
        &mut self,
        channel: ChannelId,
        col_width: u32,
        row_height: u32,
        _pix_width: u32,
        _pix_height: u32,
        session: &mut Session,
    ) -> Result<(), Self::Error> {
        self.last_pty_dims
            .lock()
            .unwrap()
            .insert(channel, (col_width, row_height));
        let msg = format!("RESIZED:{col_width}x{row_height}\r\n");
        session.data(channel, CryptoVec::from_slice(msg.as_bytes()))?;
        Ok(())
    }
}

async fn spawn_test_ssh_server(
    server_key: PrivateKey,
    user: &str,
    password: &str,
    allowed_pubkey: Option<PublicKey>,
) -> u16 {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    let config = Arc::new(server::Config {
        inactivity_timeout: Some(Duration::from_secs(60)),
        auth_rejection_time: Duration::from_millis(10),
        auth_rejection_time_initial: Some(Duration::from_millis(10)),
        keys: vec![server_key],
        ..Default::default()
    });

    let mut srv = EmbeddedSshServer {
        expected_user: user.to_string(),
        expected_password: password.to_string(),
        allowed_pubkey,
        last_pty_dims: Arc::new(Mutex::new(HashMap::new())),
    };

    tokio::spawn(async move {
        let _ = srv.run_on_socket(config, &listener).await;
    });

    port
}

#[tokio::test]
async fn test_ssh_password_auth_pty_resize_and_changed_host_key() {
    let server_key_1 = PrivateKey::random(&mut OsRng, Algorithm::Ed25519).unwrap();
    let port = spawn_test_ssh_server(server_key_1, "alice", "s3cr3t!", None).await;

    let db = Database::connect_in_memory().await.unwrap();
    let creds = Arc::new(MemoryCredentialStore::new());
    let collector = Arc::new(TestEventCollector::default());
    let manager = SessionManager::new(db.clone(), creds, collector.clone());

    let host = db
        .create_host(
            &HostInput {
                name: "Local Test Server".into(),
                hostname: "127.0.0.1".into(),
                port,
                username: "alice".into(),
                auth_method: AuthMethod::Password,
                private_key_path: None,
                group_id: None,
                description: None,
                tags: None,
                secret: None,
                save_secret: false,
            },
            None,
        )
        .await
        .unwrap();

    // 1. First connection triggers Unknown host key challenge
    let session = manager
        .connect_ssh(ConnectSshRequest {
            session_id: Some("sess-1".into()),
            host_id: host.id.clone(),
            cols: 80,
            rows: 24,
            secret: Some("s3cr3t!".into()),
            save_secret: true,
        })
        .await
        .unwrap();

    let challenge = collector.wait_for_challenge(&session.session_id).await;
    assert_eq!(challenge.status, HostKeyStatus::Unknown);
    assert!(challenge.fingerprint.starts_with("SHA256:"));

    // Trust and persist host key
    manager
        .submit_host_key_decision(HostKeyDecision {
            session_id: session.session_id.clone(),
            trust: true,
            persist: true,
        })
        .await
        .unwrap();

    collector
        .wait_for_state(&session.session_id, SessionState::Connected)
        .await;
    collector
        .wait_for_output_containing(&session.session_id, "Welcome to NexTerm Test SSH Server")
        .await;

    // 2. Test interactive PTY input/output
    manager
        .send_terminal_input(&session.session_id, b"hello-nexterm\n".to_vec())
        .await
        .unwrap();
    collector
        .wait_for_output_containing(&session.session_id, "ECHO:hello-nexterm")
        .await;

    // 3. Test terminal resize propagation
    manager
        .resize_terminal(&session.session_id, 132, 43)
        .await
        .unwrap();
    collector
        .wait_for_output_containing(&session.session_id, "RESIZED:132x43")
        .await;

    // 4. Disconnect cleanly
    manager
        .disconnect_session(&session.session_id)
        .await
        .unwrap();
    collector
        .wait_for_state(&session.session_id, SessionState::Disconnected)
        .await;

    // 5. Simulate a MITM / changed server host key on the same host identity
    let fake_key = PrivateKey::random(&mut OsRng, Algorithm::Ed25519).unwrap();
    let fake_pub_b64 = russh::keys::PublicKeyBase64::public_key_base64(fake_key.public_key());
    db.upsert_known_host(
        &format!("[127.0.0.1]:{port}"),
        "ssh-ed25519",
        &fake_pub_b64,
        "SHA256:DIFFERENTKEY",
    )
    .await
    .unwrap();

    manager
        .connect_ssh(ConnectSshRequest {
            session_id: Some("sess-mitm".into()),
            host_id: host.id.clone(),
            cols: 80,
            rows: 24,
            secret: None, // Uses saved secret from MemoryCredentialStore!
            save_secret: false,
        })
        .await
        .unwrap();

    let changed_challenge = collector.wait_for_challenge("sess-mitm").await;
    assert_eq!(changed_challenge.status, HostKeyStatus::Changed);
    assert_eq!(
        changed_challenge.previous_fingerprint.as_deref(),
        Some("SHA256:DIFFERENTKEY")
    );

    // Reject changed host key
    manager
        .submit_host_key_decision(HostKeyDecision {
            session_id: "sess-mitm".into(),
            trust: false,
            persist: false,
        })
        .await
        .unwrap();

    collector
        .wait_for_state("sess-mitm", SessionState::Failed)
        .await;
}

#[tokio::test]
async fn test_ssh_private_key_auth_and_multi_session_isolation() {
    let server_key = PrivateKey::random(&mut OsRng, Algorithm::Ed25519).unwrap();
    let client_key = PrivateKey::random(&mut OsRng, Algorithm::Ed25519).unwrap();
    let client_pubkey = client_key.public_key().clone();

    let temp_dir = tempfile::tempdir().unwrap();
    let key_file_path = temp_dir.path().join("id_ed25519_test");
    let pem = client_key
        .to_openssh(ssh_key::LineEnding::LF)
        .unwrap()
        .to_string();
    std::fs::write(&key_file_path, pem).unwrap();

    let port = spawn_test_ssh_server(server_key, "devops", "unused", Some(client_pubkey)).await;

    let db = Database::connect_in_memory().await.unwrap();
    let creds = Arc::new(MemoryCredentialStore::new());
    let collector = Arc::new(TestEventCollector::default());
    let manager = SessionManager::new(db.clone(), creds, collector.clone());

    let host = db
        .create_host(
            &HostInput {
                name: "Key Auth Server".into(),
                hostname: "127.0.0.1".into(),
                port,
                username: "devops".into(),
                auth_method: AuthMethod::PrivateKey,
                private_key_path: Some(key_file_path.to_string_lossy().to_string()),
                group_id: None,
                description: None,
                tags: None,
                secret: None,
                save_secret: false,
            },
            None,
        )
        .await
        .unwrap();

    // Open Session A
    manager
        .connect_ssh(ConnectSshRequest {
            session_id: Some("tab-a".into()),
            host_id: host.id.clone(),
            cols: 80,
            rows: 24,
            secret: None,
            save_secret: false,
        })
        .await
        .unwrap();

    let _ = collector.wait_for_challenge("tab-a").await;
    manager
        .submit_host_key_decision(HostKeyDecision {
            session_id: "tab-a".into(),
            trust: true,
            persist: true,
        })
        .await
        .unwrap();
    collector
        .wait_for_state("tab-a", SessionState::Connected)
        .await;

    // Open Session B concurrently (host key already trusted in SQLite!)
    manager
        .connect_ssh(ConnectSshRequest {
            session_id: Some("tab-b".into()),
            host_id: host.id.clone(),
            cols: 100,
            rows: 30,
            secret: None,
            save_secret: false,
        })
        .await
        .unwrap();
    collector
        .wait_for_state("tab-b", SessionState::Connected)
        .await;

    assert_eq!(manager.list_active_sessions().await.len(), 2);

    // Close Session A and verify Session B remains active and functional
    manager.disconnect_session("tab-a").await.unwrap();
    collector
        .wait_for_state("tab-a", SessionState::Disconnected)
        .await;

    manager
        .send_terminal_input("tab-b", b"still-alive\n".to_vec())
        .await
        .unwrap();
    collector
        .wait_for_output_containing("tab-b", "ECHO:still-alive")
        .await;

    manager.disconnect_session("tab-b").await.unwrap();
    collector
        .wait_for_state("tab-b", SessionState::Disconnected)
        .await;
}

