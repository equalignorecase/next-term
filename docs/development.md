# NexTerm Development Guide

## 1. Project Structure

```text
nexterm/
├── docs/
│   ├── architecture.md       # System & module architecture
│   ├── development.md        # Developer setup & testing guide
│   └── security.md           # Threat model & security controls
├── src/                      # React + TypeScript Frontend
│   ├── components/           # Modular UI components & dialogs
│   ├── lib/                  # Typed Tauri IPC, Zod schemas, Base64 utils
│   ├── store/                # Zustand state store
│   ├── test/                 # Vitest + React Testing Library suites
│   ├── types/                # Shared TypeScript interfaces
│   ├── App.tsx               # Main application shell
│   └── main.tsx              # Frontend entry point
├── src-tauri/                # Tauri 2 Rust Backend
│   ├── capabilities/         # Least-privilege Tauri v2 permissions
│   ├── icons/                # Application icons
│   ├── migrations/           # SQLx SQLite schema migrations
│   ├── src/
│   │   ├── commands.rs       # Tauri IPC command handlers
│   │   ├── credentials.rs    # OS Keychain & test memory store
│   │   ├── db.rs             # SQLite repository & migrations
│   │   ├── error.rs          # Structured error handling
│   │   ├── lib.rs            # Tauri builder setup
│   │   ├── main.rs           # Binary entry point
│   │   ├── models.rs         # Domain models & state machine
│   │   ├── ssh.rs            # Russh client & SessionManager
│   │   └── validation.rs     # Backend input validation
│   └── tests/
│       └── ssh_integration.rs # Embedded russh::server integration tests
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

---

## 2. Running Checks & Tests

### Frontend Checks

```bash
# TypeScript strict mode verification
npm run lint

# Run Vitest unit & component tests
npm test

# Build production frontend assets into dist/
npm run build
```

### Backend Checks

```bash
cd src-tauri

# Run unit tests (validation, SQLite migrations, host CRUD, known_hosts, settings)
# and in-process SSH integration tests (password auth, key auth, host key challenge, MITM rejection, PTY resize, multi-session)
cargo test
```

> **Windows MinGW / UCRT Toolchain Note**:
> On Windows machines using the `x86_64-pc-windows-gnu` toolchain without Visual Studio C++ Build Tools installed, `cargo test` compiles both the Tauri application binary and integration test binaries cleanly. If a `windows` crate version mismatch in `tauri`/`webview2` causes `0xc0000139 (STATUS_ENTRYPOINT_NOT_FOUND)` when launching a test executable linked against GUI libraries under MinGW, install the official **MSVC Build Tools** (`stable-x86_64-pc-windows-msvc`) or run core library tests isolated from the GUI shell.

---

## 3. Adding New IPC Commands

1. Define request/response structs in [`src-tauri/src/models.rs`](../src-tauri/src/models.rs) and [`src/types/models.ts`](../src/types/models.ts).
2. Add input validation in [`src-tauri/src/validation.rs`](../src-tauri/src/validation.rs) and [`src/lib/validation.ts`](../src/lib/validation.ts).
3. Implement business logic in `db.rs`, `ssh.rs`, or `credentials.rs`.
4. Expose the `#[tauri::command]` function in [`src-tauri/src/commands.rs`](../src-tauri/src/commands.rs) and register it in `tauri::generate_handler![]` inside [`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs).
5. Add the typed wrapper in [`src/lib/ipc.ts`](../src/lib/ipc.ts).

