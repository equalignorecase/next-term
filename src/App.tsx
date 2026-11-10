import React, { useEffect, useState } from "react";
import {
  Plus,
  TerminalSquare,
  X,
  ShieldCheck,
  KeyRound,
  Server,
  AlertCircle,
} from "lucide-react";

import { HostDialog } from "@/components/HostDialog";
import { HostKeyChallengeDialog } from "@/components/HostKeyChallengeDialog";
import { SecretPromptDialog } from "@/components/SecretPromptDialog";
import { Sidebar } from "@/components/Sidebar";
import { SettingsDialog } from "@/components/SettingsDialog";
import { StatusBar } from "@/components/StatusBar";
import { TerminalPane } from "@/components/TerminalPane";
import { ipc } from "@/lib/ipc";
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

  const [hostDialogOpen, setHostDialogOpen] = useState(false);
  const [editingHost, setEditingHost] = useState<Host | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Sync theme class on document root
  useEffect(() => {
    const html = document.documentElement;
    if (settings.theme === "light") {
      html.classList.remove("dark");
      html.classList.add("light");
    } else {
      html.classList.remove("light");
      html.classList.add("dark");
    }
  }, [settings.theme]);

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
  ]);

  // Native-feeling keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setEditingHost(null);
        setHostDialogOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setSettingsOpen((prev) => !prev);
      } else if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "w" &&
        activeTabId
      ) {
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
        return "bg-success";
      case "Connecting":
      case "VerifyingHost":
      case "Authenticating":
        return "bg-warning animate-pulse";
      case "Failed":
        return "bg-error";
      default:
        return "bg-secondaryText/50";
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-primaryText">
      {/* Global Error Banner */}
      {globalError && (
        <div className="flex items-center justify-between px-4 py-2 bg-error/20 border-b border-error/40 text-xs text-error">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
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
          onAddHost={openAddHost}
          onEditHost={openEditHost}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        {/* Right Content Area: Tabs + Active Terminal or Empty State */}
        <main className="flex-1 flex flex-col min-w-0 bg-background">
          {/* Session Tab Bar */}
          {tabs.length > 0 && (
            <div
              className="h-9 shrink-0 bg-sidebar border-b border-border flex items-center px-2 gap-1 overflow-x-auto select-none"
              role="tablist"
            >
              {tabs.map((tab) => {
                const active = tab.sessionId === activeTabId;
                return (
                  <div
                    key={tab.sessionId}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveTab(tab.sessionId)}
                    className={`group flex items-center gap-2 px-3 py-1.5 rounded-t-md text-xs font-medium cursor-pointer border-t border-x transition-colors max-w-[220px] ${
                      active
                        ? "bg-background text-primaryText border-border"
                        : "bg-surface/40 text-secondaryText border-transparent hover:bg-surface hover:text-primaryText"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${getTabDotColor(
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
                      className="p-0.5 rounded hover:bg-elevated text-secondaryText hover:text-primaryText ml-1"
                      aria-label={`Close session ${tab.title}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Terminal Area or Empty State */}
          <div className="flex-1 relative flex flex-col min-h-0 overflow-hidden">
            {tabs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none">
                <div className="w-14 h-14 rounded-2xl bg-surface border border-border flex items-center justify-center text-accent mb-4 shadow-lg">
                  <TerminalSquare className="w-7 h-7" />
                </div>
                <h2 className="text-base font-semibold text-primaryText">
                  Welcome to NexTerm
                </h2>
                <p className="text-xs text-secondaryText max-w-md mt-1.5 leading-relaxed">
                  A modern, local-first SSH client engineered with Rust, Russh,
                  and xterm.js. Select a saved host from the sidebar or add a
                  new server to open an interactive shell.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl w-full mt-6 text-left">
                  <div className="p-3.5 rounded-lg bg-surface border border-border space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-primaryText">
                      <ShieldCheck className="w-4 h-4 text-success" />
                      Strict Host Trust
                    </div>
                    <p className="text-[11px] text-secondaryText">
                      SHA-256 host key verification enforced on every connection.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-lg bg-surface border border-border space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-primaryText">
                      <KeyRound className="w-4 h-4 text-accent" />
                      OS Keychain
                    </div>
                    <p className="text-[11px] text-secondaryText">
                      Credentials stay in your OS Credential Manager, never
                      plaintext.
                    </p>
                  </div>
                  <div className="p-3.5 rounded-lg bg-surface border border-border space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-primaryText">
                      <Server className="w-4 h-4 text-warning" />
                      Multi-Session PTY
                    </div>
                    <p className="text-[11px] text-secondaryText">
                      Concurrent isolated tabs with full ANSI and resize support.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-6">
                  <button
                    type="button"
                    onClick={openAddHost}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-md bg-accent text-slate-950 hover:bg-blue-400 text-xs font-semibold transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add SSH Host
                  </button>
                  {hosts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => void initiateConnection(hosts[0])}
                      className="px-4 py-2 rounded-md bg-surface hover:bg-elevated border border-border text-xs font-medium text-primaryText transition-colors"
                    >
                      Quick Connect to {hosts[0].name}
                    </button>
                  )}
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

      {/* Bottom Status Bar */}
      <StatusBar />

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

