import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import type {
  AppSettings,
  ConnectSshRequest,
  Host,
  HostGroup,
  HostInput,
  HostKeyChallengeEvent,
  HostKeyDecision,
  KnownHost,
  SessionInfo,
  SftpDirectoryListing,
  SftpTransferResult,
  SshClosedEvent,
  SshErrorEvent,
  SshOutputEvent,
  SshStatusEvent,
  SshTelemetryEvent,
} from "@/types/models";

export const ipc = {
  // Host management
  listHosts: () => invoke<Host[]>("list_hosts"),
  getHost: (id: string) => invoke<Host>("get_host", { id }),
  createHost: (input: HostInput) => invoke<Host>("create_host", { input }),
  updateHost: (id: string, input: HostInput) =>
    invoke<Host>("update_host", { id, input }),
  deleteHost: (id: string) => invoke<void>("delete_host", { id }),
  duplicateHost: (id: string) => invoke<Host>("duplicate_host", { id }),

  // Host groups
  listHostGroups: () => invoke<HostGroup[]>("list_host_groups"),
  createHostGroup: (name: string, sortOrder?: number) =>
    invoke<HostGroup>("create_host_group", { name, sortOrder }),
  deleteHostGroup: (id: string) => invoke<void>("delete_host_group", { id }),

  // SSH Session management
  connectSsh: (request: ConnectSshRequest) =>
    invoke<SessionInfo>("connect_ssh", { request }),
  disconnectSsh: (sessionId: string) =>
    invoke<void>("disconnect_ssh", { sessionId }),
  sendTerminalInput: (sessionId: string, dataBase64: string) =>
    invoke<void>("send_terminal_input", { sessionId, dataBase64 }),
  resizeTerminal: (sessionId: string, cols: number, rows: number) =>
    invoke<void>("resize_terminal", { sessionId, cols, rows }),
  listActiveSessions: () => invoke<SessionInfo[]>("list_active_sessions"),

  // Security & Credentials
  submitHostKeyDecision: (decision: HostKeyDecision) =>
    invoke<void>("submit_host_key_decision", { decision }),
  listKnownHosts: () => invoke<KnownHost[]>("list_known_hosts"),
  deleteKnownHost: (id: string) => invoke<void>("delete_known_host", { id }),
  saveCredential: (hostId: string, secret: string) =>
    invoke<Host>("save_credential", { hostId, secret }),
  deleteCredential: (hostId: string) =>
    invoke<Host>("delete_credential", { hostId }),

  // Settings
  getSettings: () => invoke<AppSettings>("get_settings"),
  updateSettings: (settings: AppSettings) =>
    invoke<AppSettings>("update_settings", { settings }),

  // File dialog for private key selection
  pickPrivateKeyFile: async (): Promise<string | null> => {
    const selected = await open({
      multiple: false,
      directory: false,
      title: "Select SSH Private Key File",
    });
    if (typeof selected === "string") {
      return selected;
    }
    return null;
  },

  // SFTP file transfer & dialogs
  sftpListDir: (sessionId: string, path?: string | null) =>
    invoke<SftpDirectoryListing>("sftp_list_dir", {
      sessionId,
      path: path ?? null,
    }),
  sftpUploadFile: (
    sessionId: string,
    localPath: string,
    remoteDir?: string | null
  ) =>
    invoke<SftpTransferResult>("sftp_upload_file", {
      sessionId,
      localPath,
      remoteDir: remoteDir ?? null,
    }),
  sftpDownloadFile: (
    sessionId: string,
    remotePath: string,
    localPath: string
  ) =>
    invoke<SftpTransferResult>("sftp_download_file", {
      sessionId,
      remotePath,
      localPath,
    }),
  sftpCreateDir: (sessionId: string, path: string) =>
    invoke<void>("sftp_create_dir", { sessionId, path }),
  sftpDeleteEntry: (sessionId: string, path: string, isDir: boolean) =>
    invoke<void>("sftp_delete_entry", { sessionId, path, isDir }),

  pickLocalFilesForUpload: async (): Promise<string[]> => {
    const selected = await open({
      multiple: true,
      directory: false,
      title: "Select Local File(s) to Upload via SFTP",
    });
    if (Array.isArray(selected)) {
      return selected.filter((item): item is string => typeof item === "string");
    }
    if (typeof selected === "string") {
      return [selected];
    }
    return [];
  },

  pickLocalSavePath: async (defaultFileName: string): Promise<string | null> => {
    const baseName = defaultFileName
      .split(/[\\/]/)
      .pop()
      ?.replace(/[\0-\x1f\x7f]/g, "")
      .trim();
    const safeDefault =
      baseName && baseName !== "." && baseName !== ".." ? baseName : "download";
    const selected = await save({
      defaultPath: safeDefault,
      title: "Save Remote File to PC",
    });
    return typeof selected === "string" ? selected : null;
  },

  onWindowDragDrop: (
    handler: (payload: {
      type: "enter" | "over" | "drop" | "leave";
      paths?: string[];
    }) => void
  ): Promise<UnlistenFn> =>
    listen<{ type?: string; paths?: string[] }>("tauri://drag-drop", (e) => {
      handler({
        type: "drop",
        paths: e.payload.paths ?? [],
      });
    }),

  onWindowDragEnter: (handler: () => void): Promise<UnlistenFn> =>
    listen("tauri://drag-enter", () => handler()),

  onWindowDragLeave: (handler: () => void): Promise<UnlistenFn> =>
    listen("tauri://drag-leave", () => handler()),

  // Event listeners
  onSshStatus: (handler: (event: SshStatusEvent) => void): Promise<UnlistenFn> =>
    listen<SshStatusEvent>("ssh:status", (e) => handler(e.payload)),
  onSshOutput: (handler: (event: SshOutputEvent) => void): Promise<UnlistenFn> =>
    listen<SshOutputEvent>("ssh:output", (e) => handler(e.payload)),
  onSshError: (handler: (event: SshErrorEvent) => void): Promise<UnlistenFn> =>
    listen<SshErrorEvent>("ssh:error", (e) => handler(e.payload)),
  onSshClosed: (handler: (event: SshClosedEvent) => void): Promise<UnlistenFn> =>
    listen<SshClosedEvent>("ssh:closed", (e) => handler(e.payload)),
  onHostKeyChallenge: (
    handler: (event: HostKeyChallengeEvent) => void
  ): Promise<UnlistenFn> =>
    listen<HostKeyChallengeEvent>("ssh:host-key-challenge", (e) =>
      handler(e.payload)
    ),
  onSshTelemetry: (
    handler: (event: SshTelemetryEvent) => void
  ): Promise<UnlistenFn> =>
    listen<SshTelemetryEvent>("ssh:telemetry", (e) => handler(e.payload)),
};

