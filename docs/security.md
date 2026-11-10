# NexTerm Security Architecture & Threat Model

## 1. Security Principles

NexTerm is designed around defense-in-depth and least privilege:

1. **Zero Implicit Trust on the Network**: Every SSH connection is treated as untrusted until its server host key is cryptographically verified.
2. **Zero Plaintext Secret Persistence**: Passwords and private key passphrases are never stored in SQLite, JSON files, `localStorage`, or application logs.
3. **One-Way Secret Boundary**: Secrets flow from the user into the Rust backend (and optionally into the OS Credential Manager), but never flow back out to the webview via generic read commands.
4. **Least-Privilege Webview**: The Tauri frontend has no arbitrary shell execution or unrestricted filesystem capabilities.

---

## 2. Threat Model

| Threat / Attack Vector | Mitigation in NexTerm |
| :--- | :--- |
| **Man-in-the-Middle (MITM) on First Connection (TOFU)** | `SshClientHandler::check_server_key` pauses the SSH handshake before authentication, computes the server's `SHA256:<base64>` fingerprint, and requires explicit user confirmation via `HostKeyChallengeDialog`. Unknown keys are never auto-accepted. |
| **MITM / Host Key Spoofing on Known Host** | If a server presents a public key that differs from the entry in SQLite `known_hosts` for that `host_identity` (`hostname` or `[hostname]:port`), NexTerm flags the connection as `Changed`, displays a prominent red MITM warning comparing the old and new SHA-256 fingerprints, blocks the connection by default, and requires an explicit out-of-band verification checkbox before allowing key replacement. |
| **Local Database Compromise / Backup Leakage** | The SQLite database (`nexterm.sqlite`) stores only metadata and an opaque `credential_reference` UUID (`nexterm-cred-<uuid>`). Actual passwords and key passphrases live exclusively inside the OS-native credential vault (`keyring`: Windows Credential Manager, macOS Keychain, Linux Secret Service). |
| **Memory Inspection / Secret Remnants** | Ephemeral secrets in `ConnectSshRequest` and `CredentialStore` use `zeroize` (`Zeroize` / `Zeroizing<String>`) so sensitive buffers are wiped on drop. |
| **Malicious Terminal Escape Sequences / XSS via Terminal Output** | Terminal output is transported as Base64-encoded bytes and written directly to `@xterm/xterm`'s canvas/DOM renderer (`term.write(Uint8Array)`), never injected as raw HTML (`innerHTML`). A strict Content Security Policy (CSP) blocks remote scripts. |
| **Unbounded Output DoS** | SSH channel output is chunked into 16 KB slices, and session input commands use a bounded `tokio::sync::mpsc::channel(256)` to prevent memory exhaustion under heavy terminal flood. |
| **IPC Abuse from Webview** | Tauri capabilities (`src-tauri/capabilities/default.json`) grant only `core:default` and `dialog:allow-open` (used strictly to pick a private key path). All backend commands validate hostnames, ports, paths, and terminal dimensions before execution. |

---

## 3. Known Hosts Trust Model

- **Host Identity Formatting**: Standard port 22 hosts are keyed as lowercase `hostname` (e.g., `prod.example.com`). Non-default ports are keyed using OpenSSH bracket notation `[hostname]:port` (e.g., `[10.0.0.5]:2222`) so multiple SSH daemons on different ports of the same IP maintain independent trust records.
- **Revocation**: Users can inspect and revoke any trusted host key at any time from **Settings -> Trusted Known Hosts**.

