# NexTerm

> **โปรแกรม SSH Client ยุคใหม่ที่ปลอดภัยและออกแบบมาเพื่อนักพัฒนา (A modern, secure SSH client for developers.)**

**NexTerm** คือแอปพลิเคชัน SSH Client บนเดสก์ท็อปแบบ Cross-platform และ Local-first ที่พัฒนาด้วย **Tauri 2**, **Rust**, **Russh**, **React**, **TypeScript** และ **xterm.js** ออกแบบโดยให้ความสำคัญกับความปลอดภัยเป็นอันดับแรก (Security by Design) มาพร้อมระบบตรวจสอบลายนิ้วมือเซิร์ฟเวอร์ (SHA-256 SSH Host Key Verification) แบบบังคับทุกการเชื่อมต่อ, การเก็บรหัสผ่านผ่านระบบนิรภัยของปฏิบัติการโดยตรง (OS-native Keychain), รองรับการเปิดใช้งานหลายแท็บพร้อมกัน (Multi-tab PTY Sessions) และทำงานแบบออฟไลน์โดยไม่พึ่งพาคลาวด์หรือส่งข้อมูล Telemetry ใดๆ

---

## ฟีเจอร์หลัก (MVP ที่พัฒนาเสร็จสมบูรณ์)

- **เอนจิน SSH แบบ Asynchronous เต็มรูปแบบ (`russh` + `tokio`)**
  - รองรับ Interactive Shell พร้อมการจำลอง Remote PTY (`xterm-256color`, `xterm`, `vt100`) รองรับโปรแกรมอย่าง `vim`, `nano`, `htop`, `tmux`, `less`
  - รองรับการยืนยันตัวตนด้วยรหัสผ่าน (Password) และไฟล์กุญแจส่วนตัว (Private Key: Ed25519, RSA, ECDSA รวมถึงกุญแจที่เข้ารหัสด้วย Passphrase)
  - ซิงโครไนซ์ขนาดหน้าจอเทอร์มินัล (`window_change` PTY resize) แบบเรียลไทม์ผ่าน `ResizeObserver` และ `@xterm/addon-fit`
  - ส่งข้อมูลเทอร์มินัลแบบ Binary/UTF-8 Base64 ที่รองรับการจัดการ Backpressure ไม่ทำให้หน้าจอค้างเมื่อมีข้อมูลไหลเข้าจำนวนมาก
- **ระบบตรวจสอบ SSH Host Key แบบเข้มงวด (Mandatory Host Key Verification)**
  - ตรวจสอบกุญแจสาธารณะของเซิร์ฟเวอร์กับฐานข้อมูล `known_hosts` ใน SQLite ทุกครั้งก่อนส่งรหัสผ่าน
  - แสดงหน้าต่างยืนยันลายนิ้วมือ `SHA-256` เมื่อเชื่อมต่อเป็นครั้งแรก (`Unknown` status)
  - แจ้งเตือนภัยคุกคาม Man-in-the-Middle (MITM) ทันทีเมื่อตรวจพบว่ากุญแจของเซิร์ฟเวอร์เปลี่ยนไปจากที่เคยเชื่อถือ (`Changed` status) โดยบล็อกการเชื่อมต่อเป็นค่าเริ่มต้น และต้องได้รับการยืนยันจากผู้ใช้อย่างชัดเจนเท่านั้นจึงจะแทนที่กุญแจเดิมได้
- **การจัดเก็บข้อมูลลับด้วยระบบของ OS (`keyring`)**
  - รหัสผ่านและ Passphrase ของกุญแจจะถูกจัดเก็บไว้ใน **Windows Credential Manager**, **macOS Keychain** หรือ **Linux Secret Service**
  - ฐานข้อมูล SQLite เก็บเพียงรหัสอ้างอิง (`credential_reference`) เท่านั้น ไม่มีการเก็บรหัสผ่านจริงหรือเนื้อหา Private Key ลงในฐานข้อมูลหรือไฟล์ตั้งค่า
  - รองรับโหมดเชื่อมต่อรายครั้ง (Session-only) โดยไม่ต้องบันทึกรหัสผ่านลงเครื่อง
- **การจัดการรายการเซิร์ฟเวอร์และกลุ่ม (Host & Group Management)**
  - เพิ่ม, แก้ไข, ทำซ้ำ (Duplicate), ลบ, จัดกลุ่ม (Groups), ติดป้ายกำกับ (Tags) และค้นหา/กรองรายการเซิร์ฟเวอร์ได้รวดเร็ว
  - ตรวจสอบความถูกต้องของข้อมูล 2 ชั้น (Zod บน Frontend และตัวตรวจสอบความถูกต้องบน Rust Backend)
- **พื้นที่ทำงานแบบ Multi-Tab & Keyboard-First UI (ธีม Industrial Obsidian & Emerald)**
  - เปิดใช้งานหลายเซสชันพร้อมกันในรูปแบบแท็บ โดยการปิดแท็บหนึ่งจะไม่กระทบเซสชันอื่นที่กำลังทำงานอยู่
  - มาพร้อม **Command Palette (`Ctrl+K`)** สำหรับค้นหาและเชื่อมต่อด่วน, พับเก็บ Sidebar ด้วย `Ctrl+B`, ค้นหาข้อความในเทอร์มินัลด้วย `Ctrl+Shift+F` และแถบสถานะสไตล์ Neovim `lualine`

---

## ภาพหน้าจอ (Screenshots)

> _พื้นที่วางภาพหน้าจอ (Placeholder): สามารถนำภาพหน้าจอจากการรัน `npm run tauri dev` มาวางในตำแหน่งนี้ได้_

- `docs/assets/workspace-placeholder.png` — หน้าต่างหลักแบบ Multi-tab SSH Terminal (ธีม Industrial Obsidian & Emerald)
- `docs/assets/host-verification-placeholder.png` — หน้าต่างตรวจสอบลายนิ้วมือ SHA-256 และการแจ้งเตือน MITM

---

## เทคโนโลยีที่ใช้ (Technology Stack)

| ส่วนการทำงาน | เทคโนโลยี |
| :--- | :--- |
| **Desktop Framework** | Tauri 2 (`tauri`, `tauri-plugin-dialog`) |
| **Frontend** | React 18, TypeScript (Strict Mode), Vite, Tailwind CSS, Zustand, Zod, Lucide Icons |
| **Terminal Emulator** | `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-search`, `@xterm/addon-web-links` |
| **Backend & SSH** | Rust (2021 Edition), Tokio, `russh` 0.49, `russh-keys` 0.49 |
| **Database** | SQLite ร่วมกับ `sqlx` (ระบบ Migration อัตโนมัติ และ Parameterized Queries) |
| **Security** | `keyring` (OS-native Credential Store), `sha2`, `zeroize` |
| **Testing** | Vitest, React Testing Library, Rust Unit Tests และ `russh::server` Integration Tests |

---

## ความต้องการของระบบ (Prerequisites)

- **Node.js** >= 20.x และ **npm** >= 10.x
- **Rust Toolchain** (`rustup`, `rustc`, `cargo` รุ่น stable)
- **เครื่องมือพื้นฐานตามระบบปฏิบัติการ**:
  - **Windows**: Microsoft Visual Studio C++ Build Tools (หรือ MinGW-w64 UCRT toolchain) และ WebView2 Runtime
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libsecret-1-dev`

---

## การติดตั้งและคำสั่งสำหรับนักพัฒนา (Installation & Commands)

```bash
# 1. ติดตั้งแพ็กเกจฝั่ง Frontend
npm install

# 2. ตรวจสอบชนิดข้อมูลด้วย TypeScript Strict Mode
npm run lint

# 3. รันชุดทดสอบฝั่ง Frontend (Vitest + React Testing Library)
npm test

# 4. สร้างไฟล์ Production Bundle ของ Frontend
npm run build

# 5. รันชุดทดสอบฝั่ง Rust Backend (Unit Tests + Embedded SSH Server Integration Tests)
cd src-tauri && cargo test --no-default-features

# 6. รันแอปพลิเคชัน NexTerm ในโหมดพัฒนา (Development Mode)
npm run tauri dev

# 7. สร้างไฟล์ติดตั้งสำหรับเดสก์ท็อป (Build Desktop Packages)
npm run tauri build
```

---

## ข้อควรพิจารณาด้านความปลอดภัย (Security Considerations)

NexTerm ให้ความสำคัญกับความปลอดภัยเหนือความสะดวกสบาย:

1. **ไม่เชื่อถือเซิร์ฟเวอร์อัตโนมัติ (No Auto-Trust)**: กุญแจเซิร์ฟเวอร์ที่ไม่รู้จักหรือมีการเปลี่ยนแปลงจะไม่ถูกยอมรับโดยอัตโนมัติเด็ดขาด
2. **ไม่เก็บรหัสผ่านแบบ Plaintext**: รหัสผ่านและ Passphrase จะไม่ถูกบันทึกลงใน SQLite, `localStorage` หรือไฟล์ Log
3. **ไม่มีคำสั่งดึงรหัสผ่านกลับมายังหน้าบ้าน**: Frontend สามารถสั่งให้ Backend ใช้รหัสผ่านที่เก็บไว้เพื่อยืนยันตัวตนหรือสั่งลบได้เท่านั้น แต่ไม่มี IPC Command ใดที่อนุญาตให้ดึงรหัสผ่านแบบข้อความปกติกลับออกมาแสดงที่ฝั่ง Webview
4. **จำกัดสิทธิ์ Tauri Capabilities ขั้นต่ำ (Least Privilege)**: Webview ทำงานภายใต้ Content Security Policy (CSP) ที่เข้มงวด และเปิดสิทธิ์เฉพาะที่จำเป็น (`core:default`, `dialog:allow-open`) โดยไม่อนุญาตให้รันคำสั่ง Shell ของเครื่องผู้ใช้หรือเข้าถึงไฟล์ระบบแบบไร้ขอบเขต

อ่านรายละเอียดเพิ่มเติมเกี่ยวกับโมเดลภัยคุกคามได้ที่ [docs/security.md](docs/security.md)

---

## ระบบปฏิบัติการที่รองรับและข้อจำกัดในรุ่นปัจจุบัน (Supported Platforms & Known Limitations)

- **ระบบปฏิบัติการที่รองรับ**: Windows 10/11 (x64), macOS 12+ (Apple Silicon & Intel), Linux (x64 ที่มี WebKitGTK 4.1 และ Secret Service)
- **ข้อจำกัดที่ทราบในรุ่น MVP**:
  - ข้อมูลกุญแจเซิร์ฟเวอร์ที่เชื่อถือจะถูกบันทึกไว้ในตาราง `known_hosts` ของฐานข้อมูล SQLite ของแอป (`<AppData>/nexterm.sqlite`) แยกต่างหากโดยไม่ไปแก้ไขไฟล์ `~/.ssh/known_hosts` ของระบบโดยตรง
  - ฟีเจอร์ตัวจัดการไฟล์ SFTP, Port Forwarding, SSH Agent Forwarding และการนำเข้าไฟล์ `~/.ssh/config` อยู่ในแผนการพัฒนาระยะถัดไป (Phase 4)

---

## แผนการพัฒนา (Roadmap)

- [x] **Phase 1 — Foundation**: โครงสร้าง Tauri 2 + React + SQLite Migrations + ระบบจัดการ Host CRUD + Settings
- [x] **Phase 2 — SSH Core**: เอนจิน `russh`, การจอง PTY, การเชื่อมต่อ `xterm.js` และการตรวจสอบลายนิ้วมือ SHA-256
- [x] **Phase 3 — Session Management**: ระบบแท็บหลายเซสชันพร้อมกัน, การเชื่อมต่อ OS Keychain, Command Palette (`Ctrl+K`) และการปรับแต่งเทอร์มินัลแบบเรียลไทม์
- [ ] **Phase 4 — Advanced Features**: ตัวจัดการไฟล์ SFTP (`russh-sftp`), Local/Remote Port Forwarding, SSH Agent, ตัวนำเข้าไฟล์ `~/.ssh/config` และระบบเก็บชุดคำสั่ง (Snippets)
- [ ] **Phase 5 — Release Engineering**: ระบบ CI/CD ข้ามแพลตฟอร์มและการลงนามดิจิทัลสำหรับไฟล์ติดตั้ง (Code Signing)

---

## สัญญาอนุญาต (License)

MIT License
