import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { hostInputSchema, appSettingsSchema, isValidHostnameOrIp } from "@/lib/validation";
import { encodeBase64, decodeBase64ToBytes } from "@/lib/base64";
import { useAppStore, DEFAULT_SETTINGS } from "@/store/useAppStore";
import { ipc } from "@/lib/ipc";
import App from "@/App";
import type { Host, HostGroup, KnownHost } from "@/types/models";

vi.mock("@/lib/ipc", () => ({
  ipc: {
    listHosts: vi.fn(),
    getHost: vi.fn(),
    createHost: vi.fn(),
    updateHost: vi.fn(),
    deleteHost: vi.fn(),
    duplicateHost: vi.fn(),
    listHostGroups: vi.fn(),
    createHostGroup: vi.fn(),
    deleteHostGroup: vi.fn(),
    connectSsh: vi.fn(),
    disconnectSsh: vi.fn(),
    sendTerminalInput: vi.fn(),
    resizeTerminal: vi.fn(),
    listActiveSessions: vi.fn(),
    submitHostKeyDecision: vi.fn(),
    listKnownHosts: vi.fn(),
    deleteKnownHost: vi.fn(),
    saveCredential: vi.fn(),
    deleteCredential: vi.fn(),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    pickPrivateKeyFile: vi.fn(),
    onSshStatus: vi.fn(() => Promise.resolve(() => {})),
    onSshOutput: vi.fn(() => Promise.resolve(() => {})),
    onSshError: vi.fn(() => Promise.resolve(() => {})),
    onSshClosed: vi.fn(() => Promise.resolve(() => {})),
    onHostKeyChallenge: vi.fn(() => Promise.resolve(() => {})),
    onSshTelemetry: vi.fn(() => Promise.resolve(() => {})),
  },
}));

const sampleHost: Host = {
  id: "host-1",
  name: "Prod Bastion",
  hostname: "bastion.example.com",
  port: 22,
  username: "ops",
  authMethod: "private_key",
  credentialReference: null,
  privateKeyPath: "/home/ops/.ssh/id_ed25519",
  groupId: null,
  description: "Main entry node",
  tags: ["prod", "bastion"],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("Frontend Validation & Encoding", () => {
  it("validates hostnames and IP addresses accurately", () => {
    expect(isValidHostnameOrIp("192.168.1.50")).toBe(true);
    expect(isValidHostnameOrIp("db-01.internal.example.org")).toBe(true);
    expect(isValidHostnameOrIp("::1")).toBe(true);

    expect(isValidHostnameOrIp("")).toBe(false);
    expect(isValidHostnameOrIp("-badhost.com")).toBe(false);
    expect(isValidHostnameOrIp("spaces not allowed")).toBe(false);
  });

  it("enforces required privateKeyPath when authMethod is private_key", () => {
    const invalid = hostInputSchema.safeParse({
      name: "My Key Host",
      hostname: "10.0.0.10",
      port: 22,
      username: "ubuntu",
      authMethod: "private_key",
      privateKeyPath: "",
      saveSecret: false,
    });
    expect(invalid.success).toBe(false);

    const valid = hostInputSchema.safeParse({
      name: "My Key Host",
      hostname: "10.0.0.10",
      port: 22,
      username: "ubuntu",
      authMethod: "private_key",
      privateKeyPath: "/Users/dev/.ssh/id_ed25519",
      saveSecret: false,
    });
    expect(valid.success).toBe(true);
  });

  it("round-trips UTF-8 and ANSI terminal sequences via Base64", () => {
    const raw = "\x1b[32mHello NexTerm 🚀\x1b[0m\r\n";
    const b64 = encodeBase64(raw);
    const decodedBytes = decodeBase64ToBytes(b64);
    const decodedText = new TextDecoder().decode(decodedBytes);
    expect(decodedText).toBe(raw);
  });

  it("validates application settings bounds", () => {
    expect(appSettingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true);
    expect(
      appSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, terminalFontSize: 4 })
        .success
    ).toBe(false);
  });
});

describe("NexTerm Host Management, Multi-Tab Lifecycle & Settings UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      hosts: [sampleHost],
      groups: [] as HostGroup[],
      knownHosts: [] as KnownHost[],
      settings: DEFAULT_SETTINGS,
      searchQuery: "",
      selectedGroupId: null,
      tabs: [],
      activeTabId: null,
      hostKeyChallenges: [],
      secretPrompt: null,
      isLoading: false,
      globalError: null,
    });

    vi.mocked(ipc.listHosts).mockResolvedValue([sampleHost]);
    vi.mocked(ipc.listHostGroups).mockResolvedValue([]);
    vi.mocked(ipc.getSettings).mockResolvedValue(DEFAULT_SETTINGS);
    vi.mocked(ipc.listKnownHosts).mockResolvedValue([]);
  });

  it("renders sidebar hosts and supports creating a new host via HostDialog", async () => {
    const user = userEvent.setup();
    const createdHost: Host = {
      ...sampleHost,
      id: "host-2",
      name: "Staging Redis",
      hostname: "10.20.30.40",
      port: 2222,
      username: "admin",
      authMethod: "password",
      privateKeyPath: null,
    };
    vi.mocked(ipc.createHost).mockResolvedValue(createdHost);

    render(<App />);

    expect(await screen.findAllByText("Prod Bastion")).not.toHaveLength(0);

    // Open New Host dialog
    await user.click(screen.getByRole("button", { name: /New Host/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Display Name/i), "Staging Redis");
    await user.type(
      screen.getByLabelText(/Hostname or IP Address/i),
      "10.20.30.40"
    );
    const portInput = screen.getByLabelText(/Port \*/i);
    await user.clear(portInput);
    await user.type(portInput, "2222");

    const userInput = screen.getByLabelText(/Username \*/i);
    await user.clear(userInput);
    await user.type(userInput, "admin");

    await user.click(screen.getByRole("button", { name: /^Create Host$/i }));

    await waitFor(() => {
      expect(ipc.createHost).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findAllByText("Staging Redis")).not.toHaveLength(0);
  });

  it("opens Command Palette (Ctrl+K) and toggles collapsible sidebar", async () => {
    const user = userEvent.setup();
    render(<App />);

    await screen.findAllByText("Prod Bastion");

    // Open Command Palette via shortcut button
    await user.click(
      screen.getByRole("button", {
        name: /Command Palette & Quick Connect/i,
      })
    );
    expect(
      screen.getByRole("dialog", { name: "Command Palette" })
    ).toBeInTheDocument();

    // Filter inside Command Palette
    const paletteInput = screen.getByLabelText("Command palette search");
    await user.type(paletteInput, "Toggle Sidebar");
    await user.keyboard("{Enter}");

    // Sidebar should now be collapsed
    expect(screen.queryByPlaceholderText("Filter hosts...")).not.toBeInTheDocument();

    // Expand sidebar back via StatusBar button
    await user.click(screen.getByRole("button", { name: "Toggle Sidebar" }));
    expect(screen.getByPlaceholderText("Filter hosts...")).toBeInTheDocument();
  });

  it("opens multiple independent SSH session tabs, switches between them, and closes one without killing the other", async () => {
    const user = userEvent.setup();
    const secondHost: Host = {
      ...sampleHost,
      id: "host-2",
      name: "Worker Node 02",
      hostname: "10.0.0.52",
    };

    vi.mocked(ipc.listHosts).mockResolvedValue([sampleHost, secondHost]);
    vi.mocked(ipc.connectSsh).mockImplementation(async (req) => ({
      sessionId: req.sessionId ?? "sess-default",
      hostId: req.hostId,
      hostName: req.hostId === "host-1" ? "Prod Bastion" : "Worker Node 02",
      hostname: req.hostId === "host-1" ? "bastion.example.com" : "10.0.0.52",
      port: 22,
      username: "ops",
      state: "Connected",
      cols: req.cols,
      rows: req.rows,
      connectedAt: "2026-01-01T00:00:00Z",
      errorMessage: null,
    }));
    vi.mocked(ipc.disconnectSsh).mockResolvedValue();

    render(<App />);

    expect(await screen.findAllByText("Prod Bastion")).not.toHaveLength(0);
    expect(await screen.findAllByText("Worker Node 02")).not.toHaveLength(0);

    // Connect to first host
    await user.click(
      screen.getByRole("button", { name: "Connect to Prod Bastion" })
    );
    // Connect to second host
    await user.click(
      screen.getByRole("button", { name: "Connect to Worker Node 02" })
    );

    await waitFor(() => {
      expect(useAppStore.getState().tabs).toHaveLength(2);
    });

    const tabs = useAppStore.getState().tabs;
    expect(tabs[0].title).toBe("Prod Bastion");
    expect(tabs[1].title).toBe("Worker Node 02");

    // Close first tab
    const closeFirstBtn = screen.getByRole("button", {
      name: "Close session Prod Bastion",
    });
    await user.click(closeFirstBtn);

    await waitFor(() => {
      expect(useAppStore.getState().tabs).toHaveLength(1);
    });
    expect(useAppStore.getState().tabs[0].title).toBe("Worker Node 02");
  });

  it("displays HostKeyChallengeDialog on unknown or changed host key and submits explicit user decision", async () => {
    const user = userEvent.setup();
    vi.mocked(ipc.submitHostKeyDecision).mockResolvedValue();

    render(<App />);

    // Emit host key challenge into store
    act(() => {
      useAppStore.getState().handleHostKeyChallenge({
        sessionId: "sess-challenge-1",
        hostIdentity: "bastion.example.com",
        hostname: "bastion.example.com",
        port: 22,
        keyAlgorithm: "ssh-ed25519",
        fingerprint: "SHA256:abc123fingerprintxyz",
        publicKeyBase64: "AAAA...",
        status: "unknown",
        previousFingerprint: null,
      });
    });

    expect(
      await screen.findByText(/Verify Unknown SSH Server Host Key/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText("SHA256:abc123fingerprintxyz")
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Trust Key & Connect/i })
    );

    await waitFor(() => {
      expect(ipc.submitHostKeyDecision).toHaveBeenCalledWith({
        sessionId: "sess-challenge-1",
        trust: true,
        persist: true,
      });
    });
  });

  it("persists updated terminal settings, theme presets, and custom accent color via SettingsDialog", async () => {
    const user = userEvent.setup();
    vi.mocked(ipc.updateSettings).mockImplementation(async (s) => s);

    render(<App />);
    await screen.findAllByText("Prod Bastion");

    await user.click(
      screen.getByRole("button", { name: /Settings & Known Hosts/i })
    );
    expect(
      await screen.findByText(/Appearance, Terminal & SSH/i)
    ).toBeInTheDocument();
    expect(screen.getByTestId("live-terminal-preview")).toBeInTheDocument();

    // Select Tokyo Night preset card
    await user.click(screen.getByTestId("theme-card-tokyo-night"));
    // Pick Catppuccin Mauve accent swatch
    await user.click(
      screen.getByRole("button", { name: /Accent Catppuccin Mauve/i })
    );

    await user.click(
      screen.getByRole("button", { name: /Save Preferences/i })
    );

    await waitFor(() => {
      expect(ipc.updateSettings).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(ipc.updateSettings).mock.calls[0][0].theme).toBe(
      "tokyo-night"
    );
    expect(vi.mocked(ipc.updateSettings).mock.calls[0][0].accentColor).toBe(
      "#CBA6F7"
    );
  });

  it("displays remote CPU, RAM, and Network telemetry in the StatusBar when connected", async () => {
    const user = userEvent.setup();
    vi.mocked(ipc.connectSsh).mockImplementation(async (req) => ({
      sessionId: req.sessionId ?? "sess-telemetry",
      hostId: req.hostId,
      hostName: "Prod Bastion",
      hostname: "bastion.example.com",
      port: 22,
      username: "ops",
      state: "Connected",
      cols: req.cols,
      rows: req.rows,
      connectedAt: "2026-01-01T00:00:00Z",
      errorMessage: null,
    }));

    render(<App />);
    await screen.findAllByText("Prod Bastion");

    await user.click(
      screen.getByRole("button", { name: "Connect to Prod Bastion" })
    );

    const activeSessionId = useAppStore.getState().tabs[0].sessionId;

    act(() => {
      useAppStore.getState().handleStatusEvent(activeSessionId, "Connected", "Connected");
      useAppStore.getState().handleTelemetryEvent({
        sessionId: activeSessionId,
        cpuPercent: 42.3,
        memUsedBytes: 2 * 1024 * 1024 * 1024,
        memTotalBytes: 8 * 1024 * 1024 * 1024,
        memPercent: 25.0,
        netRxBytesPerSec: 128 * 1024,
        netTxBytesPerSec: 32 * 1024,
      });
    });

    expect(await screen.findByTestId("telemetry-cpu")).toHaveTextContent(
      "[■■░░░] 42%"
    );
    expect(screen.getByTestId("telemetry-mem")).toHaveTextContent(
      "RAM2.00 / 8.00 GB·25%"
    );
    expect(screen.getByTestId("telemetry-net")).toHaveTextContent(
      "↓ 128 KB/s"
    );
    expect(screen.getByTestId("telemetry-net")).toHaveTextContent(
      "↑ 32.0 KB/s"
    );
  });

  it("opens minimal right-click context menu on TerminalPane with Copy, Paste, Find, and Clear Terminal", async () => {
    const user = userEvent.setup();
    vi.mocked(ipc.connectSsh).mockImplementation(async (req) => ({
      sessionId: req.sessionId ?? "sess-ctx",
      hostId: req.hostId,
      hostName: "Prod Bastion",
      hostname: "bastion.example.com",
      port: 22,
      username: "ops",
      state: "Connected",
      cols: req.cols,
      rows: req.rows,
      connectedAt: "2026-01-01T00:00:00Z",
      errorMessage: null,
    }));

    render(<App />);
    await screen.findAllByText("Prod Bastion");

    await user.click(
      screen.getByRole("button", { name: "Connect to Prod Bastion" })
    );

    const activeSessionId = useAppStore.getState().tabs[0].sessionId;
    const pane = await screen.findByTestId(`terminal-pane-${activeSessionId}`);

    // Right-click on terminal pane
    await user.pointer({ keys: "[MouseRight]", target: pane });

    expect(
      await screen.findByRole("menu", { name: "Terminal context menu" })
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Copy/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Paste/i })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Clear Terminal/i })
    ).toBeInTheDocument();
  });
});
