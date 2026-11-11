export type AuthMethod = "password" | "private_key";

export interface Host {
  id: string;
  name: string;
  hostname: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  credentialReference: string | null;
  privateKeyPath: string | null;
  groupId: string | null;
  description: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface HostInput {
  name: string;
  hostname: string;
  port: number;
  username: string;
  authMethod: AuthMethod;
  privateKeyPath?: string | null;
  groupId?: string | null;
  description?: string;
  tags?: string[];
  secret?: string | null;
  saveSecret: boolean;
}

export interface HostGroup {
  id: string;
  name: string;
  sortOrder: number;
}

export interface KnownHost {
  id: string;
  hostIdentity: string;
  keyAlgorithm: string;
  publicKey: string;
  fingerprint: string;
  trustedAt: string;
}

export type SessionState =
  | "Idle"
  | "Connecting"
  | "VerifyingHost"
  | "Authenticating"
  | "Connected"
  | "Disconnecting"
  | "Disconnected"
  | "Failed";

export interface SessionInfo {
  sessionId: string;
  hostId: string;
  hostName: string;
  hostname: string;
  port: number;
  username: string;
  state: SessionState;
  cols: number;
  rows: number;
  connectedAt: string | null;
  errorMessage: string | null;
}

export interface ConnectSshRequest {
  sessionId?: string;
  hostId: string;
  cols: number;
  rows: number;
  secret?: string | null;
  saveSecret: boolean;
}

export type HostKeyStatus = "unknown" | "changed";

export interface HostKeyChallengeEvent {
  sessionId: string;
  hostIdentity: string;
  hostname: string;
  port: number;
  keyAlgorithm: string;
  fingerprint: string;
  publicKeyBase64: string;
  status: HostKeyStatus;
  previousFingerprint: string | null;
}

export interface HostKeyDecision {
  sessionId: string;
  trust: boolean;
  persist: boolean;
}

export interface SshStatusEvent {
  sessionId: string;
  state: SessionState;
  message: string | null;
}

export interface SshOutputEvent {
  sessionId: string;
  dataBase64: string;
}

export interface SshErrorEvent {
  sessionId: string;
  code: string;
  message: string;
}

export interface SshClosedEvent {
  sessionId: string;
  reason: string;
}

export interface SshTelemetryEvent {
  sessionId: string;
  cpuPercent: number;
  memUsedBytes: number;
  memTotalBytes: number;
  memPercent: number;
  netRxBytesPerSec: number;
  netTxBytesPerSec: number;
}

export type SftpEntryKind = "file" | "directory" | "symlink" | "other";

export interface SftpEntry {
  name: string;
  path: string;
  kind: SftpEntryKind;
  size: number;
  modifiedAt: number | null;
  permissions: number | null;
}

export interface SftpDirectoryListing {
  currentPath: string;
  entries: SftpEntry[];
}

export interface SftpTransferResult {
  remotePath: string;
  localPath: string;
  bytesTransferred: number;
}

export type ThemePresetId =
  | "obsidian"
  | "tokyo-night"
  | "catppuccin"
  | "dracula"
  | "nord"
  | "gruvbox"
  | "light"
  | "solarized-light"
  | "dark";

export interface AppSettings {
  theme: ThemePresetId;
  accentColor: string;
  terminalFontFamily: string;
  terminalFontSize: number;
  terminalLineHeight: number;
  terminalPadding: number;
  cursorStyle: "block" | "underline" | "bar";
  cursorBlink: boolean;
  scrollback: number;
  copyOnSelect: boolean;
  rightClickBehavior: "context_menu" | "paste";
  enableBell: boolean;
  connectionTimeoutSecs: number;
  keepaliveIntervalSecs: number;
  telemetryEnabled: boolean;
  telemetryIntervalSecs: number;
  uiDensity: "compact" | "comfortable";
  terminalType: "xterm-256color" | "xterm" | "vt100";
  defaultSshPort: number;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

