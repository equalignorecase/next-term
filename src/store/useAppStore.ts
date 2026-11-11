import { create } from "zustand";
import { ipc } from "@/lib/ipc";
import { encodeBase64 } from "@/lib/base64";
import { resolveThemePreset } from "@/lib/themes";
import { formatError } from "@/lib/utils";
import { detectDefaultLanguage } from "@/lib/i18n";
import type {
  AppSettings,
  Host,
  HostGroup,
  HostInput,
  HostKeyChallengeEvent,
  KnownHost,
  SessionState,
  SshTelemetryEvent,
} from "@/types/models";

export interface SessionTab {
  sessionId: string;
  hostId: string;
  title: string;
  hostname: string;
  port: number;
  username: string;
  state: SessionState;
  statusMessage: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  cols: number;
  rows: number;
  telemetry: SshTelemetryEvent | null;
}

export interface SecretPromptState {
  host: Host;
  reason: "missing_password" | "passphrase_required" | "retry_auth";
  existingSessionId?: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "obsidian",
  accentColor: "#10B981",
  terminalFontFamily: "JetBrains Mono, Cascadia Code, Consolas, monospace",
  terminalFontSize: 14,
  terminalLineHeight: 1.25,
  terminalPadding: 8,
  cursorStyle: "block",
  cursorBlink: true,
  scrollback: 5000,
  copyOnSelect: false,
  rightClickBehavior: "context_menu",
  enableBell: false,
  connectionTimeoutSecs: 15,
  keepaliveIntervalSecs: 30,
  terminalType: "xterm-256color",
  defaultSshPort: 22,
  telemetryEnabled: true,
  telemetryIntervalSecs: 2,
  uiDensity: "compact",
  language: detectDefaultLanguage(),
};

interface AppStore {
  hosts: Host[];
  groups: HostGroup[];
  knownHosts: KnownHost[];
  settings: AppSettings;
  searchQuery: string;
  selectedGroupId: string | null;
  tabs: SessionTab[];
  activeTabId: string | null;
  hostKeyChallenges: HostKeyChallengeEvent[];
  secretPrompt: SecretPromptState | null;
  isLoading: boolean;
  globalError: string | null;

  // Actions
  initialize: () => Promise<void>;
  setSearchQuery: (q: string) => void;
  setSelectedGroupId: (groupId: string | null) => void;
  clearGlobalError: () => void;

  // Host CRUD
  createHost: (input: HostInput) => Promise<Host>;
  updateHost: (id: string, input: HostInput) => Promise<Host>;
  deleteHost: (id: string) => Promise<void>;
  duplicateHost: (id: string) => Promise<Host>;

  // Group CRUD
  createGroup: (name: string) => Promise<HostGroup>;
  deleteGroup: (id: string) => Promise<void>;

  // Known Hosts
  refreshKnownHosts: () => Promise<void>;
  deleteKnownHost: (id: string) => Promise<void>;

  // Settings
  saveSettings: (next: AppSettings) => Promise<AppSettings>;
  toggleTheme: () => Promise<void>;

  // Sessions & Tabs
  initiateConnection: (
    host: Host,
    options?: {
      secret?: string;
      saveSecret?: boolean;
      existingSessionId?: string;
    }
  ) => Promise<void>;
  closeSecretPrompt: () => void;
  setActiveTab: (sessionId: string) => void;
  closeTab: (sessionId: string) => Promise<void>;
  reconnectTab: (sessionId: string) => Promise<void>;
  sendInput: (sessionId: string, rawTextOrBytes: string | Uint8Array) => Promise<void>;
  resizeTabTerminal: (sessionId: string, cols: number, rows: number) => Promise<void>;

  // Host key verification
  resolveHostKeyChallenge: (
    sessionId: string,
    trust: boolean,
    persist: boolean
  ) => Promise<void>;

  // Event handlers from backend
  handleStatusEvent: (
    sessionId: string,
    state: SessionState,
    message: string | null
  ) => void;
  handleErrorEvent: (sessionId: string, code: string, message: string) => void;
  handleClosedEvent: (sessionId: string, reason: string) => void;
  handleHostKeyChallenge: (challenge: HostKeyChallengeEvent) => void;
  handleTelemetryEvent: (telemetry: SshTelemetryEvent) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  hosts: [],
  groups: [],
  knownHosts: [],
  settings: DEFAULT_SETTINGS,
  searchQuery: "",
  selectedGroupId: null,
  tabs: [],
  activeTabId: null,
  hostKeyChallenges: [],
  secretPrompt: null,
  isLoading: false,
  globalError: null,

  initialize: async () => {
    set({ isLoading: true, globalError: null });
    try {
      const [hosts, groups, settings, knownHosts] = await Promise.all([
        ipc.listHosts(),
        ipc.listHostGroups(),
        ipc.getSettings(),
        ipc.listKnownHosts(),
      ]);
      set({
        hosts,
        groups,
        settings,
        knownHosts,
        isLoading: false,
      });
    } catch (err) {
      set({
        isLoading: false,
        globalError: formatError(err).message,
      });
    }
  },

  setSearchQuery: (q) => set({ searchQuery: q }),
  setSelectedGroupId: (groupId) => set({ selectedGroupId: groupId }),
  clearGlobalError: () => set({ globalError: null }),

  createHost: async (input) => {
    const created = await ipc.createHost(input);
    set((s) => ({
      hosts: [...s.hosts, created].sort((a, b) => a.name.localeCompare(b.name)),
    }));
    return created;
  },

  updateHost: async (id, input) => {
    const updated = await ipc.updateHost(id, input);
    set((s) => ({
      hosts: s.hosts
        .map((h) => (h.id === id ? updated : h))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
    return updated;
  },

  deleteHost: async (id) => {
    await ipc.deleteHost(id);
    set((s) => ({
      hosts: s.hosts.filter((h) => h.id !== id),
    }));
  },

  duplicateHost: async (id) => {
    const duplicated = await ipc.duplicateHost(id);
    set((s) => ({
      hosts: [...s.hosts, duplicated].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    }));
    return duplicated;
  },

  createGroup: async (name) => {
    const group = await ipc.createHostGroup(name, get().groups.length);
    set((s) => ({ groups: [...s.groups, group] }));
    return group;
  },

  deleteGroup: async (id) => {
    await ipc.deleteHostGroup(id);
    set((s) => ({
      groups: s.groups.filter((g) => g.id !== id),
      selectedGroupId: s.selectedGroupId === id ? null : s.selectedGroupId,
      hosts: s.hosts.map((h) =>
        h.groupId === id ? { ...h, groupId: null } : h
      ),
    }));
  },

  refreshKnownHosts: async () => {
    const knownHosts = await ipc.listKnownHosts();
    set({ knownHosts });
  },

  deleteKnownHost: async (id) => {
    await ipc.deleteKnownHost(id);
    set((s) => ({
      knownHosts: s.knownHosts.filter((k) => k.id !== id),
    }));
  },

  saveSettings: async (next) => {
    const saved = await ipc.updateSettings(next);
    set({ settings: saved });
    return saved;
  },

  toggleTheme: async () => {
    const current = get().settings;
    const isCurrentlyLight = resolveThemePreset(current.theme).isLight;
    const nextTheme = isCurrentlyLight ? "obsidian" : "light";
    const nextPreset = resolveThemePreset(nextTheme);
    const nextSettings: AppSettings = {
      ...current,
      theme: nextTheme,
      accentColor: nextPreset.defaultAccent,
    };
    set({ settings: nextSettings });
    try {
      const saved = await ipc.updateSettings(nextSettings);
      set({ settings: saved });
    } catch {
      // Keep optimistic theme state if backend save fails in test/mock
    }
  },

  initiateConnection: async (host, options) => {
    // If password auth is configured and no stored credential or ephemeral secret is provided, prompt first
    if (
      host.authMethod === "password" &&
      !host.credentialReference &&
      !options?.secret
    ) {
      set({
        secretPrompt: {
          host,
          reason: "missing_password",
          existingSessionId: options?.existingSessionId,
        },
      });
      return;
    }

    const sessionId =
      options?.existingSessionId ||
      `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const existingTab = get().tabs.find((t) => t.sessionId === sessionId);
    const cols = existingTab?.cols ?? 100;
    const rows = existingTab?.rows ?? 30;

    const newTab: SessionTab = {
      sessionId,
      hostId: host.id,
      title: host.name,
      hostname: host.hostname,
      port: host.port,
      username: host.username,
      state: "Connecting",
      statusMessage: `Connecting to ${host.hostname}:${host.port}...`,
      errorCode: null,
      errorMessage: null,
      cols,
      rows,
      telemetry: null,
    };

    set((s) => ({
      tabs: existingTab
        ? s.tabs.map((t) => (t.sessionId === sessionId ? newTab : t))
        : [...s.tabs, newTab],
      activeTabId: sessionId,
      secretPrompt: null,
    }));

    try {
      await ipc.connectSsh({
        sessionId,
        hostId: host.id,
        cols,
        rows,
        secret: options?.secret ?? null,
        saveSecret: options?.saveSecret ?? false,
      });
      if (options?.saveSecret) {
        const refreshedHost = await ipc.getHost(host.id);
        set((s) => ({
          hosts: s.hosts.map((h) => (h.id === host.id ? refreshedHost : h)),
        }));
      }
    } catch (err) {
      const formatted = formatError(err);
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.sessionId === sessionId
            ? {
                ...t,
                state: "Failed",
                errorCode: formatted.code,
                errorMessage: formatted.message,
                statusMessage: formatted.message,
              }
            : t
        ),
      }));
    }
  },

  closeSecretPrompt: () => set({ secretPrompt: null }),

  setActiveTab: (sessionId) => set({ activeTabId: sessionId }),

  closeTab: async (sessionId) => {
    const tab = get().tabs.find((t) => t.sessionId === sessionId);
    if (
      tab &&
      tab.state !== "Disconnected" &&
      tab.state !== "Failed"
    ) {
      try {
        await ipc.disconnectSsh(sessionId);
      } catch {
        // Ignore disconnect errors when closing tab
      }
    }

    set((s) => {
      const remaining = s.tabs.filter((t) => t.sessionId !== sessionId);
      let nextActive = s.activeTabId;
      if (s.activeTabId === sessionId) {
        nextActive =
          remaining.length > 0 ? remaining[remaining.length - 1].sessionId : null;
      }
      return {
        tabs: remaining,
        activeTabId: nextActive,
        hostKeyChallenges: s.hostKeyChallenges.filter(
          (c) => c.sessionId !== sessionId
        ),
      };
    });
  },

  reconnectTab: async (sessionId) => {
    const tab = get().tabs.find((t) => t.sessionId === sessionId);
    if (!tab) return;
    const host = get().hosts.find((h) => h.id === tab.hostId);
    if (!host) return;
    await get().initiateConnection(host, { existingSessionId: sessionId });
  },

  sendInput: async (sessionId, rawTextOrBytes) => {
    const b64 = encodeBase64(rawTextOrBytes);
    await ipc.sendTerminalInput(sessionId, b64);
  },

  resizeTabTerminal: async (sessionId, cols, rows) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.sessionId === sessionId ? { ...t, cols, rows } : t
      ),
    }));
    try {
      await ipc.resizeTerminal(sessionId, cols, rows);
    } catch {
      // Ignore resize errors when session is not yet connected
    }
  },

  resolveHostKeyChallenge: async (sessionId, trust, persist) => {
    await ipc.submitHostKeyDecision({ sessionId, trust, persist });
    set((s) => ({
      hostKeyChallenges: s.hostKeyChallenges.filter(
        (c) => c.sessionId !== sessionId
      ),
    }));
    if (trust && persist) {
      await get().refreshKnownHosts();
    }
  },

  handleStatusEvent: (sessionId, state, message) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.sessionId === sessionId
          ? {
              ...t,
              state,
              statusMessage: message ?? t.statusMessage,
              errorMessage: state === "Connected" ? null : t.errorMessage,
              errorCode: state === "Connected" ? null : t.errorCode,
            }
          : t
      ),
    }));
  },

  handleErrorEvent: (sessionId, code, message) => {
    const tab = get().tabs.find((t) => t.sessionId === sessionId);
    const host = tab ? get().hosts.find((h) => h.id === tab.hostId) : undefined;

    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.sessionId === sessionId
          ? {
              ...t,
              state: "Failed",
              errorCode: code,
              errorMessage: message,
              statusMessage: message,
            }
          : t
      ),
      secretPrompt:
        host &&
        (code === "PASSPHRASE_REQUIRED" || code === "AUTHENTICATION_FAILED")
          ? {
              host,
              reason:
                code === "PASSPHRASE_REQUIRED"
                  ? "passphrase_required"
                  : "retry_auth",
              existingSessionId: sessionId,
            }
          : s.secretPrompt,
    }));
  },

  handleClosedEvent: (sessionId, reason) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.sessionId === sessionId
          ? {
              ...t,
              state: t.state === "Failed" ? "Failed" : "Disconnected",
              statusMessage: reason,
            }
          : t
      ),
      hostKeyChallenges: s.hostKeyChallenges.filter(
        (c) => c.sessionId !== sessionId
      ),
    }));
  },

  handleHostKeyChallenge: (challenge) => {
    set((s) => ({
      hostKeyChallenges: [
        ...s.hostKeyChallenges.filter(
          (c) => c.sessionId !== challenge.sessionId
        ),
        challenge,
      ],
    }));
  },

  handleTelemetryEvent: (telemetry) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.sessionId === telemetry.sessionId ? { ...t, telemetry } : t
      ),
    }));
  },
}));

