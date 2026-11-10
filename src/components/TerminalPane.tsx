import React, { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { Search, X, RotateCcw, AlertTriangle, Loader2 } from "lucide-react";

import { decodeBase64ToBytes } from "@/lib/base64";
import { ipc } from "@/lib/ipc";
import { useAppStore, type SessionTab } from "@/store/useAppStore";

interface TerminalPaneProps {
  tab: SessionTab;
  isActive: boolean;
}

export const TerminalPane: React.FC<TerminalPaneProps> = ({ tab, isActive }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);

  const settings = useAppStore((s) => s.settings);
  const sendInput = useAppStore((s) => s.sendInput);
  const resizeTabTerminal = useAppStore((s) => s.resizeTabTerminal);
  const reconnectTab = useAppStore((s) => s.reconnectTab);

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Initialize xterm instance once per session tab
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isLight = settings.theme === "light";
    const term = new Terminal({
      fontFamily: settings.terminalFontFamily,
      fontSize: settings.terminalFontSize,
      lineHeight: settings.terminalLineHeight,
      cursorStyle: settings.cursorStyle,
      cursorBlink: settings.cursorBlink,
      scrollback: settings.scrollback,
      allowProposedApi: true,
      convertEol: false,
      theme: isLight
        ? {
            background: "#FFFFFF",
            foreground: "#0F172A",
            cursor: "#2563EB",
            selectionBackground: "rgba(37, 99, 235, 0.25)",
          }
        : {
            background: "#0B0F16",
            foreground: "#F8FAFC",
            cursor: "#60A5FA",
            selectionBackground: "rgba(96, 165, 250, 0.28)",
            black: "#0B0F16",
            red: "#EF4444",
            green: "#22C55E",
            yellow: "#F59E0B",
            blue: "#60A5FA",
            magenta: "#C084FC",
            cyan: "#38BDF8",
            white: "#F8FAFC",
            brightBlack: "#64748B",
            brightRed: "#F87171",
            brightGreen: "#4ADE80",
            brightYellow: "#FBBF24",
            brightBlue: "#93C5FD",
            brightMagenta: "#D8B4FE",
            brightCyan: "#7DD3FC",
            brightWhite: "#FFFFFF",
          },
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(webLinksAddon);

    term.open(container);
    termRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // Initial fit
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
        if (term.cols >= 10 && term.rows >= 2) {
          void resizeTabTerminal(tab.sessionId, term.cols, term.rows);
        }
      } catch {
        // Ignore fit error when container has 0 size
      }
    });

    // Forward user keystrokes to active SSH session
    const onDataDisposable = term.onData((data) => {
      void sendInput(tab.sessionId, data);
    });

    const onBinaryDisposable = term.onBinary((binary) => {
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i) & 0xff;
      }
      void sendInput(tab.sessionId, bytes);
    });

    // Custom key handler for Ctrl+Shift+F (Search), Ctrl+Shift+C (Copy), Ctrl+Shift+V (Paste)
    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type === "keydown" && ev.ctrlKey && ev.shiftKey) {
        if (ev.key.toLowerCase() === "f") {
          setShowSearch((prev) => !prev);
          setTimeout(() => searchInputRef.current?.focus(), 20);
          return false;
        }
        if (ev.key.toLowerCase() === "c" && term.hasSelection()) {
          void navigator.clipboard.writeText(term.getSelection());
          return false;
        }
      }
      return true;
    });

    // Subscribe to SSH output events for this specific sessionId
    let unlistenOutput: (() => void) | null = null;
    let isDisposed = false;

    void ipc
      .onSshOutput((event) => {
        if (isDisposed || event.sessionId !== tab.sessionId) return;
        const bytes = decodeBase64ToBytes(event.dataBase64);
        term.write(bytes);
      })
      .then((unlisten) => {
        if (isDisposed) {
          unlisten();
        } else {
          unlistenOutput = unlisten;
        }
      });

    // ResizeObserver to synchronize PTY dimensions on window or split resize
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (!termRef.current || !fitAddonRef.current) return;
        try {
          fitAddonRef.current.fit();
          const { cols, rows } = termRef.current;
          if (cols >= 10 && rows >= 2) {
            void resizeTabTerminal(tab.sessionId, cols, rows);
          }
        } catch {
          // Ignore when hidden
        }
      }, 60);
    });

    resizeObserver.observe(container);

    return () => {
      isDisposed = true;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      if (unlistenOutput) unlistenOutput();
      onDataDisposable.dispose();
      onBinaryDisposable.dispose();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.sessionId]);

  // Apply live settings updates without restarting session
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontFamily = settings.terminalFontFamily;
    term.options.fontSize = settings.terminalFontSize;
    term.options.lineHeight = settings.terminalLineHeight;
    term.options.cursorStyle = settings.cursorStyle;
    term.options.cursorBlink = settings.cursorBlink;
    term.options.scrollback = settings.scrollback;
    term.options.theme =
      settings.theme === "light"
        ? {
            background: "#FFFFFF",
            foreground: "#0F172A",
            cursor: "#2563EB",
          }
        : {
            background: "#0B0F16",
            foreground: "#F8FAFC",
            cursor: "#60A5FA",
          };
    try {
      fitAddonRef.current?.fit();
    } catch {
      // ignore
    }
  }, [settings]);

  // Focus & fit when tab becomes active
  useEffect(() => {
    if (isActive && termRef.current && fitAddonRef.current) {
      requestAnimationFrame(() => {
        try {
          fitAddonRef.current?.fit();
          termRef.current?.focus();
          if (
            termRef.current &&
            termRef.current.cols >= 10 &&
            termRef.current.rows >= 2
          ) {
            void resizeTabTerminal(
              tab.sessionId,
              termRef.current.cols,
              termRef.current.rows
            );
          }
        } catch {
          // ignore
        }
      });
    }
  }, [isActive, tab.sessionId, resizeTabTerminal]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      searchAddonRef.current?.findNext(searchQuery);
    }
  };

  const isConnecting =
    tab.state === "Connecting" ||
    tab.state === "VerifyingHost" ||
    tab.state === "Authenticating";

  return (
    <div
      className={
        isActive
          ? "relative flex flex-col flex-1 w-full h-full overflow-hidden bg-background"
          : "hidden"
      }
      data-testid={`terminal-pane-${tab.sessionId}`}
    >
      {/* Floating Search Bar */}
      {showSearch && (
        <form
          onSubmit={handleSearch}
          className="absolute top-3 right-5 z-20 flex items-center gap-1.5 bg-elevated border border-border rounded-md px-2.5 py-1.5 shadow-lg"
        >
          <Search className="w-3.5 h-3.5 text-secondaryText" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value) {
                searchAddonRef.current?.findNext(e.target.value);
              }
            }}
            placeholder="Find in terminal..."
            className="bg-transparent text-xs text-primaryText focus:outline-none w-44"
          />
          <button
            type="button"
            onClick={() => {
              setShowSearch(false);
              termRef.current?.focus();
            }}
            className="text-secondaryText hover:text-primaryText p-0.5"
            aria-label="Close terminal search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </form>
      )}

      {/* Connection Progress Banner */}
      {isConnecting && (
        <div className="flex items-center justify-between px-4 py-2 bg-surface border-b border-border text-xs text-secondaryText">
          <div className="flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
            <span className="font-medium text-primaryText">{tab.state}:</span>
            <span>{tab.statusMessage}</span>
          </div>
          <span className="font-mono text-[11px]">
            {tab.username}@{tab.hostname}:{tab.port}
          </span>
        </div>
      )}

      {/* Disconnected or Failed Banner with Safe Reconnect */}
      {(tab.state === "Failed" || tab.state === "Disconnected") && (
        <div
          className={`flex items-center justify-between px-4 py-2.5 border-b text-xs ${
            tab.state === "Failed"
              ? "bg-error/10 border-error/30 text-error"
              : "bg-elevated/70 border-border text-secondaryText"
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <div>
              <span className="font-semibold mr-1.5">
                {tab.state === "Failed"
                  ? `Connection Failed (${tab.errorCode ?? "ERROR"}):`
                  : "Disconnected:"}
              </span>
              <span>{tab.errorMessage ?? tab.statusMessage}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void reconnectTab(tab.sessionId)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface hover:bg-elevated text-primaryText border border-border transition-colors font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reconnect
          </button>
        </div>
      )}

      {/* xterm.js Canvas / Viewport Container */}
      <div
        ref={containerRef}
        className="flex-1 w-full h-full overflow-hidden"
        onClick={() => termRef.current?.focus()}
      />
    </div>
  );
};

