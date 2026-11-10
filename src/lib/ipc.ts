import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
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
  SshClosedEvent,
  SshErrorEvent,
  SshOutputEvent,
  SshStatusEvent,
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
};

