import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Terminal,
  Plus,
  Settings,
  PanelLeft,
  XCircle,
  Search,
  CornerDownLeft,
  KeyRound,
  Lock,
} from "lucide-react";

import { resolveThemePreset } from "@/lib/themes";
import { useAppStore } from "@/store/useAppStore";
import type { Host } from "@/types/models";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onAddHost: () => void;
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
  onToggleSftp?: () => void;
}

interface PaletteItem {
  id: string;
  category: "HOST" | "ACTION";
  label: string;
  sublabel: string;
  shortcut?: string;
  authMethod?: "password" | "private_key";
  onSelect: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  onAddHost,
  onOpenSettings,
  onToggleSidebar,
  onToggleSftp,
}) => {
  const hosts = useAppStore((s) => s.hosts);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const theme = useAppStore((s) => s.settings.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const initiateConnection = useAppStore((s) => s.initiateConnection);
  const closeTab = useAppStore((s) => s.closeTab);

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const items: PaletteItem[] = useMemo(() => {
    const hostItems: PaletteItem[] = hosts.map((h: Host) => ({
      id: `host-${h.id}`,
      category: "HOST",
      label: h.name,
      sublabel: `${h.username}@${h.hostname}:${h.port}`,
      authMethod: h.authMethod,
      onSelect: () => {
        onClose();
        void initiateConnection(h);
      },
    }));

    const actionItems: PaletteItem[] = [
      {
        id: "act-new-host",
        category: "ACTION",
        label: "New SSH Host",
        sublabel: "host:create",
        shortcut: "Ctrl+N",
        onSelect: () => {
          onClose();
          onAddHost();
        },
      },
      {
        id: "act-toggle-sidebar",
        category: "ACTION",
        label: "Toggle Sidebar",
        sublabel: "view:sidebar",
        shortcut: "Ctrl+B",
        onSelect: () => {
          onClose();
          onToggleSidebar();
        },
      },
      {
        id: "act-toggle-theme",
        category: "ACTION",
        label: `Toggle Theme (Current: ${resolveThemePreset(theme).name})`,
        sublabel: "view:theme",
        onSelect: () => {
          onClose();
          void toggleTheme();
        },
      },
      {
        id: "act-settings",
        category: "ACTION",
        label: "Open Settings & Known Hosts",
        sublabel: "config:preferences",
        shortcut: "Ctrl+,",
        onSelect: () => {
          onClose();
          onOpenSettings();
        },
      },
    ];

    if (activeTabId) {
      if (onToggleSftp) {
        actionItems.push({
          id: "act-toggle-sftp",
          category: "ACTION",
          label: "Toggle SFTP File Manager Drawer",
          sublabel: "sftp:files",
          shortcut: "Ctrl+Shift+E",
          onSelect: () => {
            onClose();
            onToggleSftp();
          },
        });
      }
      actionItems.push({
        id: "act-close-tab",
        category: "ACTION",
        label: "Disconnect & Close Active Session",
        sublabel: "session:kill",
        shortcut: "Ctrl+W",
        onSelect: () => {
          onClose();
          void closeTab(activeTabId);
        },
      });
    }

    const all = [...hostItems, ...actionItems];
    if (!query.trim()) return all;

    const q = query.toLowerCase();
    return all.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.sublabel.toLowerCase().includes(q)
    );
  }, [
    hosts,
    activeTabId,
    theme,
    query,
    onClose,
    initiateConnection,
    onAddHost,
    onToggleSidebar,
    onToggleSftp,
    toggleTheme,
    onOpenSettings,
    closeTab,
  ]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => (items.length > 0 ? (i + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) =>
        items.length > 0 ? (i - 1 + items.length) % items.length : 0
      );
    } else if (e.key === "Enter" && items[selectedIndex]) {
      e.preventDefault();
      items[selectedIndex].onSelect();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] bg-black/75 backdrop-blur-xs p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="w-full max-w-xl bg-sidebar border border-border rounded-md shadow-2xl overflow-hidden font-mono"
      >
        {/* Command Input Header */}
        <div className="flex items-center px-3.5 py-2.5 border-b border-border bg-background gap-2.5">
          <span className="text-accent font-bold text-xs">&gt;_</span>
          <Search className="w-3.5 h-3.5 text-secondaryText shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Connect to host or run command..."
            aria-label="Command palette search"
            className="flex-1 bg-transparent text-xs text-primaryText focus:outline-none placeholder:text-secondaryText/60"
          />
          <kbd className="px-1.5 py-0.5 text-[10px] text-secondaryText bg-surface border border-border rounded-xs">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-1.5 divide-y divide-border/30">
          {items.length === 0 ? (
            <div className="py-8 text-center text-xs text-secondaryText">
              No matching hosts or commands.
            </div>
          ) : (
            items.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setSelectedIndex(idx)}
                  onClick={item.onSelect}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xs text-left text-xs transition-colors ${
                    isSelected
                      ? "bg-elevated text-primaryText border-l-2 border-accent"
                      : "text-secondaryText hover:bg-surface/60"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {item.category === "HOST" ? (
                      <Terminal
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isSelected ? "text-accent" : "text-secondaryText"
                        }`}
                      />
                    ) : item.id === "act-new-host" ? (
                      <Plus className="w-3.5 h-3.5 shrink-0 text-cyber" />
                    ) : item.id === "act-toggle-sidebar" ? (
                      <PanelLeft className="w-3.5 h-3.5 shrink-0 text-cyber" />
                    ) : item.id === "act-close-tab" ? (
                      <XCircle className="w-3.5 h-3.5 shrink-0 text-error" />
                    ) : (
                      <Settings className="w-3.5 h-3.5 shrink-0 text-cyber" />
                    )}

                    <span
                      className={`font-medium truncate ${
                        isSelected ? "text-primaryText" : "text-primaryText/90"
                      }`}
                    >
                      {item.label}
                    </span>

                    {item.authMethod && (
                      <span className="text-[10px] text-secondaryText">
                        {item.authMethod === "private_key" ? (
                          <KeyRound className="w-3 h-3 inline text-accent/80" />
                        ) : (
                          <Lock className="w-3 h-3 inline text-secondaryText/70" />
                        )}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 ml-3">
                    <span className="text-[11px] text-secondaryText">
                      {item.sublabel}
                    </span>
                    {item.shortcut ? (
                      <kbd className="px-1.5 py-0.5 text-[10px] bg-background border border-border rounded-xs text-secondaryText">
                        {item.shortcut}
                      </kbd>
                    ) : (
                      isSelected && (
                        <CornerDownLeft className="w-3 h-3 text-accent" />
                      )
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Hints */}
        <div className="px-3.5 py-1.5 bg-background border-t border-border flex items-center justify-between text-[10px] text-secondaryText">
          <div className="flex items-center gap-3">
            <span>
              <strong className="text-primaryText">↑↓</strong> navigate
            </span>
            <span>
              <strong className="text-primaryText">↵</strong> execute
            </span>
            <span>
              <strong className="text-primaryText">esc</strong> dismiss
            </span>
          </div>
          <span className="text-accent/80">NEXTERM // PALETTE</span>
        </div>
      </div>
    </div>
  );
};

