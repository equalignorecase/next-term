import React, { useCallback, useEffect, useRef, useState } from "react";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import {
  Search,
  X,
  RotateCcw,
  AlertTriangle,
  Loader2,
  Copy,
  ClipboardPaste,
  Trash2,
  CheckSquare,
  Check,
} from "lucide-react";

import { decodeBase64ToBytes } from "@/lib/base64";
import { ipc } from "@/lib/ipc";
import { buildTerminalTheme } from "@/lib/themes";
import { useAppStore, type SessionTab } from "@/store/useAppStore";
import type { ThemePresetId } from "@/types/models";

interface TerminalPaneProps {
  tab: SessionTab;
  isActive: boolean;
  onDirectoryChange?: (newPath: string) => void;
}

interface ContextMenuPosition {
  x: number;
  y: number;
  hasSelection: boolean;
}

export function getTerminalTheme(
  mode: ThemePresetId,
  accentColor = "#10B981"
): ITheme {
  return buildTerminalTheme(mode, accentColor);
}

export const TerminalPane: React.FC<TerminalPaneProps> = ({
  tab,
  isActive,
  onDirectoryChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const inputBufferRef = useRef<string>("");
  const onDirectoryChangeRef = useRef(onDirectoryChange);

  useEffect(() => {
    onDirectoryChangeRef.current = onDirectoryChange;
  }, [onDirectoryChange]);

  const settings = useAppStore((s) => s.settings);
  const sendInput = useAppStore((s) => s.sendInput);
  const resizeTabTerminal = useAppStore((s) => s.resizeTabTerminal);
  const reconnectTab = useAppStore((s) => s.reconnectTab);

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenuPosition | null>(
    null
  );
  const [clipboardNotice, setClipboardNotice] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashNotice = useCallback((msg: string) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setClipboardNotice(msg);
    noticeTimerRef.current = setTimeout(() => {
      setClipboardNotice(null);
    }, 1400);
  }, []);

  const copySelectionToClipboard = useCallback(async () => {
    const term = termRef.current;
    if (!term || !term.hasSelection()) return false;
    const selectedText = term.getSelection();
    if (!selectedText) return false;
    try {
      await navigator.clipboard.writeText(selectedText);
      term.clearSelection();
      flashNotice("Copied selection");
      return true;
    } catch {
      return false;
    }
  }, [flashNotice]);

  const pasteFromClipboard = useCallback(async () => {
    const term = termRef.current;
    if (!term) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        if (typeof term.paste === "function") {
          term.paste(text);
        } else {
          void sendInput(tab.sessionId, text);
        }
      }
    } catch {
      // Clipboard read permission denied or empty
    }
  }, [sendInput, tab.sessionId]);

  // Initialize xterm instance once per session tab
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const term = new Terminal({
      fontFamily: settings.terminalFontFamily,
      fontSize: settings.terminalFontSize,
      lineHeight: settings.terminalLineHeight,
      cursorStyle: settings.cursorStyle,
      cursorBlink: settings.cursorBlink,
      scrollback: settings.scrollback,
      allowProposedApi: true,
      convertEol: false,
      theme: getTerminalTheme(settings.theme, settings.accentColor),
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

    // Register OSC 7 (standard terminal current working directory report)
    // Format: OSC 7 ; file://hostname/path ST
    const oscDisposable = term.parser?.registerOscHandler
      ? term.parser.registerOscHandler(7, (data: string) => {
          try {
            let path = data;
            if (path.startsWith("file://")) {
              const url = new URL(path);
              path = decodeURIComponent(url.pathname);
            }
            if (path && onDirectoryChangeRef.current) {
              onDirectoryChangeRef.current(path);
            }
          } catch {
            // ignore malformed OSC 7
          }
          return true;
        })
      : { dispose: () => {} };

    // Forward user keystrokes to active SSH session
    const onDataDisposable = term.onData((data) => {
      // Track command line inputs for directory changes (e.g. `cd /var/www/app`)
      for (const char of data) {
        if (char === "\r" || char === "\n") {
          const trimmed = inputBufferRef.current.trim();
          inputBufferRef.current = "";

          // Match cd command: cd /path, cd ~/path, cd ..
          const cdMatch = trimmed.match(/^cd\s+(.+)$/i);
          if (cdMatch && cdMatch[1]) {
            let targetPath = cdMatch[1].trim();
            // remove surrounding quotes if any
            if (
              (targetPath.startsWith('"') && targetPath.endsWith('"')) ||
              (targetPath.startsWith("'") && targetPath.endsWith("'"))
            ) {
              targetPath = targetPath.slice(1, -1);
            }
            if (targetPath && onDirectoryChangeRef.current) {
              onDirectoryChangeRef.current(targetPath);
            }
          }
        } else if (char === "\x7f" || char === "\b") {
          // Backspace
          inputBufferRef.current = inputBufferRef.current.slice(0, -1);
        } else if (char === "\x03") {
          // Ctrl+C: clear buffer
          inputBufferRef.current = "";
        } else if (char >= " ") {
          inputBufferRef.current += char;
        }
      }

      void sendInput(tab.sessionId, data);
    });

    const onBinaryDisposable = term.onBinary((binary) => {
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i) & 0xff;
      }
      void sendInput(tab.sessionId, bytes);
    });

    // Optional Auto Copy-on-Select support
    const onSelectionDisposable =
      typeof term.onSelectionChange === "function"
        ? term.onSelectionChange(() => {
            if (!useAppStore.getState().settings.copyOnSelect) return;
            if (term.hasSelection()) {
              const selected = term.getSelection();
              if (selected) {
                void navigator.clipboard.writeText(selected).then(() => {
                  flashNotice("Auto-copied selection");
                });
              }
            }
          })
        : { dispose: () => {} };

    // Smart Clipboard & Search Keyboard Handler:
    // - Ctrl+C (when text is selected) or Ctrl+Shift+C: Copy selection & clear highlight
    // - Ctrl+C (when nothing is selected): Pass through to shell as SIGINT (\x03)
    // - Ctrl+V or Ctrl+Shift+V: Paste from OS clipboard via term.paste()
    // - Ctrl+Shift+F: Open terminal buffer search
    term.attachCustomKeyEventHandler((ev) => {
      if (ev.type !== "keydown") return true;

      const mod = ev.ctrlKey || ev.metaKey;
      if (!mod) return true;

      const key = ev.key.toLowerCase();

      // Search (Ctrl+Shift+F)
      if (ev.shiftKey && key === "f") {
        ev.preventDefault();
        setShowSearch((prev) => !prev);
        setTimeout(() => searchInputRef.current?.focus(), 20);
        return false;
      }

      // Copy (Ctrl+C with active selection, or Ctrl+Shift+C)
      if (key === "c" && (ev.shiftKey || term.hasSelection())) {
        if (term.hasSelection()) {
          ev.preventDefault();
          void copySelectionToClipboard();
          return false;
        }
        return !ev.shiftKey;
      }

      // Paste (Ctrl+V or Ctrl+Shift+V)
      if (key === "v") {
        ev.preventDefault();
        void pasteFromClipboard();
        return false;
      }

      // Allow Global App Shortcuts (Ctrl+K, Ctrl+B, Ctrl+N, Ctrl+W, Ctrl+,, Ctrl+Shift+E) to bubble up
      if (!ev.shiftKey && ["k", "b", "n", "w", ","].includes(key)) {
        return false;
      }
      if (ev.shiftKey && key === "e") {
        return false;
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
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      resizeObserver.disconnect();
      if (unlistenOutput) unlistenOutput();
      onDataDisposable.dispose();
      onBinaryDisposable.dispose();
      onSelectionDisposable.dispose();
      oscDisposable.dispose();
      term.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.sessionId]);

  // Dismiss context menu on outside click or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, [contextMenu]);

  // Apply live settings updates (including complete full-palette theme sync) without restarting session
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontFamily = settings.terminalFontFamily;
    term.options.fontSize = settings.terminalFontSize;
    term.options.lineHeight = settings.terminalLineHeight;
    term.options.cursorStyle = settings.cursorStyle;
    term.options.cursorBlink = settings.cursorBlink;
    term.options.scrollback = settings.scrollback;
    term.options.theme = getTerminalTheme(settings.theme, settings.accentColor);
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

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (settings.rightClickBehavior === "paste") {
      void pasteFromClipboard();
      termRef.current?.focus();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(e.clientX - rect.left, Math.max(10, rect.width - 190));
    const y = Math.min(e.clientY - rect.top, Math.max(10, rect.height - 170));
    setContextMenu({
      x,
      y,
      hasSelection: Boolean(termRef.current?.hasSelection()),
    });
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
      onContextMenu={handleContextMenu}
    >
      {/* Subtle Clipboard Feedback Pill */}
      {clipboardNotice && (
        <div className="absolute top-2.5 right-4 z-30 flex items-center gap-1.5 px-2.5 py-1 rounded-xs bg-sidebar border border-accent/50 text-[11px] font-mono text-accent shadow-lg pointer-events-none">
          <Check className="w-3 h-3" />
          <span>{clipboardNotice}</span>
        </div>
      )}

      {/* Minimal Right-Click Context Menu */}
      {contextMenu && (
        <div
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          role="menu"
          aria-label="Terminal context menu"
          className="absolute z-30 w-44 py-1 rounded-xs bg-sidebar border border-border shadow-2xl font-mono text-xs divide-y divide-border/50"
        >
          <div className="py-0.5">
            <button
              type="button"
              role="menuitem"
              disabled={!contextMenu.hasSelection}
              onClick={() => {
                setContextMenu(null);
                void copySelectionToClipboard();
                termRef.current?.focus();
              }}
              className="w-full px-3 py-1.5 flex items-center justify-between text-left hover:bg-elevated text-primaryText disabled:opacity-40 disabled:pointer-events-none"
            >
              <span className="flex items-center gap-2">
                <Copy className="w-3 h-3 text-accent" />
                <span>Copy</span>
              </span>
              <span className="text-[10px] text-secondaryText">Ctrl+C</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setContextMenu(null);
                void pasteFromClipboard();
                termRef.current?.focus();
              }}
              className="w-full px-3 py-1.5 flex items-center justify-between text-left hover:bg-elevated text-primaryText"
            >
              <span className="flex items-center gap-2">
                <ClipboardPaste className="w-3 h-3 text-cyber" />
                <span>Paste</span>
              </span>
              <span className="text-[10px] text-secondaryText">Ctrl+V</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setContextMenu(null);
                termRef.current?.selectAll();
                termRef.current?.focus();
              }}
              className="w-full px-3 py-1.5 flex items-center justify-between text-left hover:bg-elevated text-primaryText"
            >
              <span className="flex items-center gap-2">
                <CheckSquare className="w-3 h-3 text-secondaryText" />
                <span>Select All</span>
              </span>
            </button>
          </div>

          <div className="py-0.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setContextMenu(null);
                setShowSearch(true);
                setTimeout(() => searchInputRef.current?.focus(), 20);
              }}
              className="w-full px-3 py-1.5 flex items-center justify-between text-left hover:bg-elevated text-primaryText"
            >
              <span className="flex items-center gap-2">
                <Search className="w-3 h-3 text-secondaryText" />
                <span>Find</span>
              </span>
              <span className="text-[10px] text-secondaryText">Ctrl+⇧+F</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setContextMenu(null);
                termRef.current?.clear();
                termRef.current?.focus();
              }}
              className="w-full px-3 py-1.5 flex items-center justify-between text-left hover:bg-elevated text-primaryText"
            >
              <span className="flex items-center gap-2">
                <Trash2 className="w-3 h-3 text-error" />
                <span>Clear Terminal</span>
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Floating Monospace Search Bar */}
      {showSearch && (
        <form
          onSubmit={handleSearch}
          className="absolute top-2.5 right-4 z-20 flex items-center gap-1.5 bg-sidebar border border-border rounded-xs px-2.5 py-1 shadow-xl font-mono"
        >
          <Search className="w-3 h-3 text-accent" />
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
            placeholder="search buffer..."
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
            <X className="w-3 h-3" />
          </button>
        </form>
      )}

      {/* Sleek Connection Handshake Bar */}
      {isConnecting && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-sidebar border-b border-border text-[11px] font-mono text-secondaryText">
          <div className="flex items-center gap-2">
            <Loader2 className="w-3 h-3 text-accent animate-spin" />
            <span className="text-accent uppercase font-semibold">
              [{tab.state}]
            </span>
            <span>{tab.statusMessage}</span>
          </div>
          <span className="text-secondaryText/80">
            {tab.username}@{tab.hostname}:{tab.port}
          </span>
        </div>
      )}

      {/* Disconnected or Failed Banner with Safe Reconnect */}
      {(tab.state === "Failed" || tab.state === "Disconnected") && (
        <div
          className={`flex items-center justify-between px-3 py-1.5 border-b text-[11px] font-mono ${
            tab.state === "Failed"
              ? "bg-error/10 border-error/30 text-error"
              : "bg-sidebar border-border text-secondaryText"
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <div className="truncate">
              <span className="font-bold mr-1.5">
                {tab.state === "Failed"
                  ? `[${tab.errorCode ?? "ERROR"}]`
                  : "[EOF]"}
              </span>
              <span>{tab.errorMessage ?? tab.statusMessage}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void reconnectTab(tab.sessionId)}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-xs bg-surface hover:bg-elevated text-primaryText border border-border transition-colors shrink-0 ml-3"
          >
            <RotateCcw className="w-3 h-3 text-accent" />
            <span>reconnect</span>
          </button>
        </div>
      )}

      {/* xterm.js Canvas / Viewport Container */}
      <div
        ref={containerRef}
        className="flex-1 w-full h-full overflow-hidden bg-background"
        onClick={() => {
          setContextMenu(null);
          termRef.current?.focus();
        }}
      />
    </div>
  );
};
