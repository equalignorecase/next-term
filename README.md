# NexTerm

> **A modern, secure SSH client for developers.**

NexTerm is a local-first, cross-platform desktop SSH client built with **Tauri 2**, **Rust**, **Russh**, **React**, **TypeScript**, and **xterm.js**. It is engineered with security by design: mandatory SHA-256 SSH host key verification, OS-native credential storage, isolated multi-tab PTY sessions, and zero cloud or telemetry dependencies.

---

## Features (MVP Implemented)

- **Real Asynchronous SSH Engine (`russh` + `tokio`)**
  - Interactive remote shell with full PTY allocation (`xterm-256color`, `xterm`, `vt100`).
  - Password authentication and OpenSSH private key authentication (Ed25519, RSA, ECDSA, including encrypted keys with passphrase prompts).
  - Real-time terminal resizing (`window_change` synchronization via `ResizeObserver` and `@xterm/addon-fit`).
  - Backpressure-aware binary/UTF-8 terminal streaming.
- **Mandatory SSH Host Key Verification**
  - Strict verification against local SQLite `known_hosts` trust store.
  - Interactive SHA-256 fingerprint prompt on first connection (`Unknown` status).
  - Explicit Man-in-the-Middle (MITM) security warning when a server's public key changes (`Changed` status), blocking connection unless the user explicitly verifies and confirms replacement.
- **OS-Native Credential Storage (`keyring`)**
  - Passwords and private key passphrases are stored in **Windows Credential Manager**, **macOS Keychain**, or **Linux Secret Service**.
  - SQLite stores only an opaque `credential_reference` identifier—never plaintext secrets or raw private keys.
  - Supports ephemeral session-only authentication without persisting secrets.
- **Complete Host & Group Management**
  - Create, edit, duplicate, delete, group, tag, and filter/search SSH hosts.
  - Dual-layer input validation (Zod on the frontend + strict Rust validation on the backend).
- **Multi-Tab Terminal Workspace**
  - Run multiple independent SSH sessions concurrently.
  - Switching or closing one tab preserves other active sessions.
  - Integrated terminal search (`Ctrl+Shift+F`), clickable web links, and live theme/font/cursor preferences.

---

## Screenshots

> _Placeholder: Add screenshots of the NexTerm main workspace, Host Key Verification modal, and Host Editor dialog after running `npm run tauri dev` on your target platform._

- `docs/assets/workspace-placeholder.png` — Multi-tab SSH terminal workspace (Dark Charcoal theme)
- `docs/assets/host-verification-placeholder.png` — SHA-256 Host Key Verification & MITM warning modal

---

## Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Desktop Shell** | Tauri 2 (`tauri`, `tauri-plugin-dialog`) |
| **Frontend** | React 18, TypeScript (Strict), Vite, Tailwind CSS, Zustand, Zod, Lucide Icons |
| **Terminal** | `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-search`, `@xterm/addon-web-links` |
| **Backend & SSH** | Rust (2021 Edition), Tokio, `russh` 0.49, `russh-keys` 0.49 |
| **Persistence** | SQLite with `sqlx` (compile-time/runtime migrations, parameterized queries) |
| **Security** | `keyring` (OS-native secret store), `sha2`, `zeroize` |
| **Testing** | Vitest, React Testing Library, Rust Unit Tests & `russh::server` Integration Tests |

---

## Prerequisites

- **Node.js** >= 20.x and **npm** >= 10.x
- **Rust Toolchain** (`rustup`, `rustc`, `cargo` stable)
- **Platform Native Dependencies**:
  - **Windows**: Microsoft Visual Studio C++ Build Tools (or MinGW-w64 UCRT toolchain) + WebView2 Runtime
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libsecret-1-dev`

---

## Installation & Development Commands

```bash
# 1. Install frontend dependencies
npm install

# 2. Run TypeScript strict typecheck / linting
npm run lint

# 3. Run frontend unit & component tests (Vitest)
npm test

# 4. Build frontend production bundle
npm run build

# 5. Run Rust backend unit & embedded SSH server integration tests
cd src-tauri && cargo test

# 6. Start NexTerm desktop app in development mode
npm run tauri dev

# 7. Build native desktop installer packages
npm run tauri build
```

---

## Security Considerations

NexTerm prioritizes security over convenience:

1. **No Auto-Trust**: Unknown or changed SSH host keys are never accepted silently.
2. **No Plaintext Secrets**: Passwords and passphrases are never written to SQLite, `localStorage`, or logs.
3. **No Generic Secret Extraction IPC**: The frontend can request the backend to authenticate using a stored credential reference or delete it, but there is no IPC command that returns stored plaintext passwords back to the webview.
4. **Restricted Tauri Capabilities**: The webview runs under a strict Content Security Policy (CSP) and minimal Tauri v2 permissions (`core:default`, `dialog:allow-open`), without arbitrary local shell execution or unrestricted filesystem access.

See [docs/security.md](docs/security.md) for the full threat model and security architecture.

---

## Supported Platforms & Known Limitations

- **Supported Platforms**: Windows 10/11 (x64), macOS 12+ (Apple Silicon & Intel), Linux (x64 with WebKitGTK 4.1 & Secret Service).
- **Known Limitations in MVP**:
  - Host trust decisions are persisted in NexTerm's dedicated SQLite `known_hosts` table (`<AppData>/nexterm.sqlite`) rather than mutating the user's global `~/.ssh/known_hosts` file directly.
  - SFTP file browser, local/remote port forwarding, SSH agent forwarding, and `~/.ssh/config` import are planned for Phase 4 and are not part of the core MVP.

---

## Roadmap

- [x] **Phase 1 — Foundation**: Tauri 2 + React + SQLite migrations + Host CRUD + Settings
- [x] **Phase 2 — SSH Core**: `russh` client, PTY allocation, xterm.js streaming, SHA-256 host key verification
- [x] **Phase 3 — Session Management**: Multi-tab concurrent sessions, OS Keychain integration, live terminal settings
- [ ] **Phase 4 — Advanced Features**: SFTP file manager (`russh-sftp`), local/remote port forwarding, SSH agent authentication, OpenSSH config importer, command snippets
- [ ] **Phase 5 — Release Engineering**: Cross-platform CI/CD pipelines and code-signed release installers

---

## License

MIT License

