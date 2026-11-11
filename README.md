# NexTerm

SSH Client บนเดสก์ท็อปแบบ Local-first สำหรับนักพัฒนา (Tauri 2 + Rust + React + xterm.js)

## ฟีเจอร์หลัก (Features)

- **Async SSH & PTY (`russh`)**: รองรับ Password และ Private Key (`Ed25519`, `RSA`, `ECDSA` + Passphrase), เปิดหลายแท็บแยกอิสระ, ซิงค์ขนาดหน้าจออัตโนมัติ
- **ความปลอดภัย (Security)**: ตรวจลายนิ้วมือเซิร์ฟเวอร์ `SHA-256` ทุกครั้ง (กัน MITM) และเก็บรหัสผ่านใน OS Keychain (`keyring`) เท่านั้น
- **Live Server Telemetry**: แสดงสถานะ `CPU`, `RAM`, `NET (↓/↑)` ของเซิร์ฟเวอร์แบบเรียลไทม์บน Status Bar
- **Theme Engine & Customization**: 8 ธีมสำหรับ Dev (`Obsidian`, `Tokyo Night`, `Catppuccin`, `Dracula`, `Nord`, `Gruvbox`, `Light`, `Solarized Light`), ปรับสี Accent (`#HEX`), ฟอนต์, Padding และ Live Terminal Preview
- **Smart Clipboard & Shortcuts**: `Ctrl+C` (คัดลอกเมื่อคลุมดำ / ส่ง `SIGINT` เมื่อไม่คลุมดำ), `Ctrl+V` วาง, Auto Copy-on-Select, คลิกขวา Context Menu, `Ctrl+K` Command Palette, `Ctrl+B` พับ Sidebar

## เทคโนโลยี (Tech Stack)

- **Frontend**: React 19, TypeScript, Tailwind CSS, Zustand, Zod, `@xterm/xterm`
- **Backend**: Tauri 2, Rust (`tokio`, `russh`, `russh-keys`), SQLite (`sqlx`), `keyring`

## คำสั่งใช้งาน (Commands)

```bash
npm install                                      # ติดตั้งแพ็กเกจ
npm run tauri dev                                # รันแอปโหมดพัฒนา
npm run tauri build                              # สร้างไฟล์ติดตั้ง Desktop
npm run lint && npm test && npm run build        # ตรวจ Type, รัน Test และ Build หน้าบ้าน
cd src-tauri && cargo test --no-default-features # รัน Unit & SSH Integration Tests ฝั่ง Rust
```
