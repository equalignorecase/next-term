import React, { useEffect, useState } from "react";
import {
  Plus,
  X,
  AlertCircle,
  Command,
  KeyRound,
  Lock,
  ArrowRight,
  PanelLeft,
} from "lucide-react";

import { CommandPalette } from "@/components/CommandPalette";
import { HostDialog } from "@/components/HostDialog";
import { HostKeyChallengeDialog } from "@/components/HostKeyChallengeDialog";
import { SecretPromptDialog } from "@/components/SecretPromptDialog";
import { Sidebar } from "@/components/Sidebar";
import { SettingsDialog } from "@/components/SettingsDialog";
import { StatusBar } from "@/components/StatusBar";
import { TerminalPane } from "@/components/TerminalPane";
import { ipc } from "@/lib/ipc";
import { applyThemeToDocument } from "@/lib/themes";
import { useAppStore } from "@/store/useAppStore";
import type { Host } from "@/types/models";

export const App: React.FC = () => {
  const initialize = useAppStore((s) => s.initialize);
  const hosts = useAppStore((s) => s.hosts);
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const settings = useAppStore((s) => s.settings);
  const hostKeyChallenges = useAppStore((s) => s.hostKeyChallenges);
  const globalError = useAppStore((s) => s.globalError);
  const clearGlobalError = useAppStore((s) => s.clearGlobalError);

  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const closeTab = useAppStore((s) => s.closeTab);
  const initiateConnection = useAppStore((s) => s.initiateConnection);
  const handleStatusEvent = useAppStore((s) => s.handleStatusEvent);
  const handleErrorEvent = useAppStore((s) => s.handleErrorEvent);
  const handleClosedEvent = useAppStore((s) => s.handleClosedEvent);
  const handleHostKeyChallenge = useAppStore((s) => s.handleHostKeyChallenge);
  const handleTelemetryEvent = useAppStore((s) => s.handleTelemetryEvent);

  const [hostDialogOpen, setHostDialogOpen] = useState(false);
  const [editingHost, setEditingHost] = useState<Host | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Sync theme preset, accent color, and terminal padding on document root
  useEffect(() => {
    applyThemeToDocument(
      settings.theme,
      settings.accentColor,
      settings.terminalPadding
    );
  }, [settings.theme, settings.accentColor, settings.terminalPadding]);

  // Initialize database state & subscribe to Tauri backend SSH events
  useEffect(() => {
    void initialize();

    const unlisteners: Array<() => void> = [];
    let mounted = true;

    void Promise.all([
      ipc.onSshStatus((ev) =>
        handleStatusEvent(ev.sessionId, ev.state, ev.message)
      ),
      ipc.onSshError((ev) =>
        handleErrorEvent(ev.sessionId, ev.code, ev.message)
      ),
      ipc.onSshClosed((ev) => handleClosedEvent(ev.sessionId, ev.reason)),
      ipc.onHostKeyChallenge((ev) => handleHostKeyChallenge(ev)),
      ipc.onSshTelemetry((ev) => handleTelemetryEvent(ev)),
    ]).then((fns) => {
      if (!mounted) {
        fns.forEach((fn) => fn());
      } else {
        unlisteners.push(...fns);
      }
    });

    return () => {
      mounted = false;
      unlisteners.forEach((fn) => fn());
    };
  }, [
    initialize,
    handleStatusEvent,
    handleErrorEvent,
    handleClosedEvent,
    handleHostKeyChallenge,
    handleTelemetryEvent,
  ]);

  // Global Developer Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      const key = e.key.toLowerCase();
      if (key === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      } else if (key === "b") {
        e.preventDefault();
        setSidebarCollapsed((prev) => !prev);
      } else if (key === "n") {
        e.preventDefault();
        setEditingHost(null);
        setHostDialogOpen(true);
      } else if (e.key === ",") {
        e.preventDefault();
        setSettingsOpen((prev) => !prev);
      } else if (key === "w" && activeTabId) {
        e.preventDefault();
        void closeTab(activeTabId);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTabId, closeTab]);

  const openAddHost = () => {
    setEditingHost(null);
    setHostDialogOpen(true);
  };

  const openEditHost = (host: Host) => {
    setEditingHost(host);
    setHostDialogOpen(true);
  };

  const getTabDotColor = (state: string) => {
    switch (state) {
      case "Connected":
        return "bg-accent shadow-[0_0_6px_#10B981]";
      case "Connecting":
      case "VerifyingHost":
      case "Authenticating":
        return "bg-warning animate-pulse";
      case "Failed":
        return "bg-error";
      default:
        return "bg-secondaryText/40";
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-primaryText">
      {/* Global Error Banner */}
      {globalError && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-error/15 border-b border-error/40 text-xs font-mono text-error">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{globalError}</span>
          </div>
          <button
            type="button"
            onClick={clearGlobalError}
            className="p-0.5 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar
          collapsed={sidebarCollapsed}
          onAddHost={openAddHost}
          onEditHost={openEditHost}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenPalette={() => setPaletteOpen(true)}
        />

        {/* Right Content Area: Sleek Monospace Tab Strip + Terminal or Keyboard-First Empty State */}
        <main className="flex-1 flex flex-col min-w-0 bg-background">
          {/* Sleek Monospace Tab Bar */}
          {(tabs.length > 0 || sidebarCollapsed) && (
            <div
              className="h-9 shrink-0 bg-sidebar border-b border-border flex items-stretch justify-between select-none font-mono"
              role="tablist"
            >
              <div className="flex items-stretch overflow-x-auto min-w-0">
                {sidebarCollapsed && (
                  <button
                    type="button"
                    onClick={() => setSidebarCollapsed(false)}
                    className="px-2.5 flex items-center gap-1.5 border-r border-border text-secondaryText hover:text-primaryText hover:bg-surface transition-colors text-xs"
                    title="Expand Sidebar (Ctrl+B)"
                  >
                    <PanelLeft className="w-3.5 h-3.5 text-accent" />
                  </button>
                )}

                {tabs.map((tab, idx) => {
                  const active = tab.sessionId === activeTabId;
                  return (
                    <div
                      key={tab.sessionId}
                      role="tab"
                      aria-selected={active}
                      onClick={() => setActiveTab(tab.sessionId)}
                      className={`group relative flex items-center gap-2 px-3.5 text-xs cursor-pointer border-r border-border transition-colors max-w-[240px] ${
                        active
                          ? "bg-background text-primaryText font-semibold"
                          : "bg-sidebar text-secondaryText hover:bg-surface/60 hover:text-primaryText"
                      }`}
                    >
                      {/* 2px Top Emerald Active Indicator */}
                      {active && (
                        <div className="absolute top-0 left-0 right-0 h-[2px] bg-accent" />
                      )}

                      <span className="text-[10px] text-secondaryText/60">
                        {idx + 1}:
                      </span>
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${getTabDotColor(
                          tab.state
                        )}`}
                        title={`Status: ${tab.state}`}
                      />
                      <span className="truncate">{tab.title}</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void closeTab(tab.sessionId);
                        }}
                        className="p-0.5 rounded-xs opacity-60 group-hover:opacity-100 hover:bg-elevated text-secondaryText hover:text-error ml-1 transition-opacity"
                        aria-label={`Close session ${tab.title}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Right Quick Actions in Tab Strip */}
              <div className="flex items-center px-2 gap-1.5 shrink-0 border-l border-border bg-background/30">
                <button
                  type="button"
                  onClick={() => setPaletteOpen(true)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-xs bg-surface hover:bg-elevated border border-border text-[10px] text-secondaryText hover:text-primaryText transition-colors"
                  title="Command Palette (Ctrl+K)"
                >
                  <Command className="w-3 h-3 text-accent" />
                  <span>Ctrl+K</span>
                </button>
              </div>
            </div>
          )}

          {/* Terminal Area or Keyboard-First Minimal Empty State */}
          <div className="flex-1 relative flex flex-col min-h-0 overflow-hidden">
            {tabs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 select-none font-mono">
                <div className="w-full max-w-md space-y-6">
                  {/* Minimal Terminal Header */}
                  <div className="border-b border-border pb-4 flex items-baseline justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-accent font-bold text-base">
                        &gt;_
                      </span>
                      <h2 className="text-sm font-bold tracking-widest uppercase text-primaryText">
                        NEXTERM
                      </h2>
                    </div>
                    <span className="text-[11px] text-secondaryText">
                      RUSSH // XTERM // SQLITE
                    </span>
                  </div>

                  {/* Keyboard Shortcuts Table (Neovim / Raycast style) */}
                  <div className="space-y-1.5 text-xs">
                    <div className="text-[10px] uppercase tracking-widest text-secondaryText mb-2">
                      KEYBINDINGS
                    </div>

                    <button
                      type="button"
                      onClick={() => setPaletteOpen(true)}
                      className="w-full flex items-center justify-between py-1.5 px-2 rounded-xs hover:bg-surface text-secondaryText hover:text-primaryText transition-colors"
                    >
                      <span>Command Palette & Quick Connect</span>
                      <kbd className="px-1.5 py-0.5 text-[10px] bg-surface border border-border rounded-xs text-accent">
                        Ctrl + K
                      </kbd>
                    </button>

                    <button
                      type="button"
                      onClick={openAddHost}
                      className="w-full flex items-center justify-between py-1.5 px-2 rounded-xs hover:bg-surface text-secondaryText hover:text-primaryText transition-colors"
                    >
                      <span>Add SSH Host</span>
                      <kbd className="px-1.5 py-0.5 text-[10px] bg-surface border border-border rounded-xs text-primaryText">
                        Ctrl + N
                      </kbd>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSidebarCollapsed((v) => !v)}
                      className="w-full flex items-center justify-between py-1.5 px-2 rounded-xs hover:bg-surface text-secondaryText hover:text-primaryText transition-colors"
                    >
                      <span>Toggle Host Registry Sidebar</span>
                      <kbd className="px-1.5 py-0.5 text-[10px] bg-surface border border-border rounded-xs text-primaryText">
                        Ctrl + B
                      </kbd>
                    </button>

                    <button
                      type="button"
                      onClick={() => setSettingsOpen(true)}
                      className="w-full flex items-center justify-between py-1.5 px-2 rounded-xs hover:bg-surface text-secondaryText hover:text-primaryText transition-colors"
                    >
                      <span>Preferences & Known Hosts Trust Store</span>
                      <kbd className="px-1.5 py-0.5 text-[10px] bg-surface border border-border rounded-xs text-primaryText">
                        Ctrl + ,
                      </kbd>
                    </button>
                  </div>

                  {/* Quick Host Launch List */}
                  <div className="pt-2 border-t border-border space-y-2">
                    <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-secondaryText">
                      <span>SAVED TARGETS ({hosts.length})</span>
                      <button
                        type="button"
                        onClick={openAddHost}
                        className="text-accent hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>new target</span>
                      </button>
                    </div>

                    {hosts.length === 0 ? (
                      <div className="p-3 rounded-xs bg-sidebar border border-border text-xs text-secondaryText flex items-center justify-between">
                        <span>No targets registered.</span>
                        <button
                          type="button"
                          onClick={openAddHost}
                          className="px-2.5 py-1 rounded-xs bg-accent text-slate-950 font-semibold text-[11px]"
                        >
                          + Add SSH Host
                        </button>
                      </div>
                    ) : (
                      <div className="divide-y divide-border/40 border border-border rounded-xs bg-sidebar">
                        {hosts.slice(0, 5).map((h) => (
                          <button
                            key={h.id}
                            type="button"
                            onClick={() => void initiateConnection(h)}
                            className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-elevated transition-colors group"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {h.authMethod === "private_key" ? (
                                <KeyRound className="w-3 h-3 text-accent shrink-0" />
                              ) : (
                                <Lock className="w-3 h-3 text-secondaryText shrink-0" />
                              )}
                              <span className="text-primaryText font-medium truncate">
                                {h.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-secondaryText shrink-0">
                              <span>
                                {h.username}@{h.hostname}:{h.port}
                              </span>
                              <ArrowRight className="w-3 h-3 text-accent opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              tabs.map((tab) => (
                <TerminalPane
                  key={tab.sessionId}
                  tab={tab}
                  isActive={tab.sessionId === activeTabId}
                />
              ))
            )}
          </div>
        </main>
      </div>

      {/* Bottom Segmented Telemetry Bar */}
      <StatusBar
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
      />

      {/* Command Palette (Ctrl+K) */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onAddHost={openAddHost}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
      />

      {/* Modals & Security Challenge Dialogs */}
      <HostDialog
        open={hostDialogOpen}
        editingHost={editingHost}
        onClose={() => setHostDialogOpen(false)}
      />

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      <SecretPromptDialog />

      {hostKeyChallenges.length > 0 && (
        <HostKeyChallengeDialog challenge={hostKeyChallenges[0]} />
      )}
    </div>
  );
};

export default App;
