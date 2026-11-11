import React, { useState } from "react";
import {
  Plus,
  Search,
  Settings,
  FolderPlus,
  Play,
  Pencil,
  Copy,
  Trash2,
  KeyRound,
  Lock,
  X,
  Command,
  Sun,
  Moon,
} from "lucide-react";

import { resolveThemePreset } from "@/lib/themes";
import { useTranslation } from "@/lib/useTranslation";
import { useAppStore } from "@/store/useAppStore";
import type { Host } from "@/types/models";

interface SidebarProps {
  collapsed: boolean;
  onAddHost: () => void;
  onEditHost: (host: Host) => void;
  onOpenSettings: () => void;
  onOpenPalette: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onAddHost,
  onEditHost,
  onOpenSettings,
  onOpenPalette,
}) => {
  const { t } = useTranslation();
  const hosts = useAppStore((s) => s.hosts);
  const groups = useAppStore((s) => s.groups);
  const tabs = useAppStore((s) => s.tabs);
  const theme = useAppStore((s) => s.settings.theme);
  const uiDensity = useAppStore((s) => s.settings.uiDensity);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const isLightTheme = resolveThemePreset(theme).isLight;
  const searchQuery = useAppStore((s) => s.searchQuery);
  const selectedGroupId = useAppStore((s) => s.selectedGroupId);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const setSelectedGroupId = useAppStore((s) => s.setSelectedGroupId);
  const initiateConnection = useAppStore((s) => s.initiateConnection);
  const duplicateHost = useAppStore((s) => s.duplicateHost);
  const deleteHost = useAppStore((s) => s.deleteHost);
  const createGroup = useAppStore((s) => s.createGroup);
  const deleteGroup = useAppStore((s) => s.deleteGroup);

  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [confirmDeleteHostId, setConfirmDeleteHostId] = useState<string | null>(
    null
  );

  if (collapsed) return null;

  const filteredHosts = hosts.filter((h) => {
    if (selectedGroupId && h.groupId !== selectedGroupId) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      h.name.toLowerCase().includes(q) ||
      h.hostname.toLowerCase().includes(q) ||
      h.username.toLowerCase().includes(q) ||
      h.description.toLowerCase().includes(q) ||
      h.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      await createGroup(newGroupName.trim());
      setNewGroupName("");
      setAddingGroup(false);
    } catch {
      // ignore duplicate group name error
    }
  };

  const isHostConnected = (hostId: string) =>
    tabs.some((t) => t.hostId === hostId && t.state === "Connected");

  return (
    <aside className="w-64 shrink-0 bg-sidebar border-r border-border flex flex-col h-full select-none">
      {/* Compact Terminal-Style Brand Header */}
      <div className="h-10 shrink-0 flex items-center justify-between px-3 border-b border-border bg-background/40">
        <div className="flex items-center gap-2 font-mono min-w-0">
          <span className="text-accent font-bold text-xs tracking-tighter shrink-0">
            &gt;_
          </span>
          <h1 className="text-xs font-bold tracking-widest uppercase text-primaryText truncate">
            NEXTERM
          </h1>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => void toggleTheme()}
            className="h-6 w-6 flex items-center justify-center rounded-xs bg-surface hover:bg-elevated border border-border text-secondaryText hover:text-primaryText transition-colors shrink-0"
            title={
              !isLightTheme ? "Switch to Light Mode" : "Switch to Dark Mode"
            }
            aria-label="Toggle Theme"
          >
            {!isLightTheme ? (
              <Sun className="w-3 h-3 text-warning shrink-0" />
            ) : (
              <Moon className="w-3 h-3 text-accent shrink-0" />
            )}
          </button>
          <button
            type="button"
            onClick={onOpenPalette}
            className="h-6 px-1.5 flex items-center justify-center gap-1 rounded-xs bg-surface hover:bg-elevated border border-border text-[10px] font-mono text-secondaryText hover:text-primaryText transition-colors whitespace-nowrap"
            title="Command Palette (Ctrl+K)"
            aria-label="Open Command Palette"
          >
            <Command className="w-3 h-3 shrink-0" />
            <span>K</span>
          </button>
          <button
            type="button"
            onClick={onAddHost}
            className="h-6 w-6 flex items-center justify-center rounded-xs bg-accent/15 hover:bg-accent/25 border border-accent/40 text-accent transition-colors shrink-0"
            title="New Host (Ctrl+N)"
            aria-label="New Host"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>
      </div>

      {/* Filter Input */}
      <div className="p-2 border-b border-border">
        <div className="relative flex items-center">
          <Search className="w-3 h-3 text-secondaryText absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchHosts")}
            aria-label="Search hosts"
            className="w-full pl-7 pr-6 py-1 text-xs font-mono bg-background border border-border rounded-xs focus:outline-none focus:border-accent text-primaryText placeholder:text-secondaryText/50"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 text-secondaryText hover:text-primaryText"
              aria-label="Clear search"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Groups Section */}
      <div className="px-2.5 py-2 border-b border-border space-y-1.5">
        <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-secondaryText px-0.5">
          <span>NAMESPACE / GROUPS</span>
          <button
            type="button"
            onClick={() => setAddingGroup((v) => !v)}
            className="hover:text-accent p-0.5 rounded-xs transition-colors"
            title="Create Host Group"
          >
            <FolderPlus className="w-3 h-3" />
          </button>
        </div>

        {addingGroup && (
          <form onSubmit={handleCreateGroup} className="flex gap-1 pt-0.5">
            <input
              type="text"
              autoFocus
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="group_name"
              className="flex-1 px-2 py-0.5 text-[11px] font-mono bg-background border border-border rounded-xs text-primaryText focus:outline-none focus:border-accent"
            />
            <button
              type="submit"
              className="px-2 py-0.5 text-[10px] font-mono bg-accent text-slate-950 font-semibold rounded-xs"
            >
              ADD
            </button>
          </form>
        )}

        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setSelectedGroupId(null)}
            className={`px-1.5 py-0.5 rounded-xs text-[10px] font-mono transition-colors ${
              selectedGroupId === null
                ? "bg-accent/15 text-accent border border-accent/40"
                : "text-secondaryText hover:text-primaryText bg-background/60 border border-border/60"
            }`}
          >
            * ({hosts.length})
          </button>

          {groups.map((g) => {
            const count = hosts.filter((h) => h.groupId === g.id).length;
            const active = selectedGroupId === g.id;
            return (
              <div
                key={g.id}
                className={`group flex items-center gap-1 px-1.5 py-0.5 rounded-xs text-[10px] font-mono transition-colors ${
                  active
                    ? "bg-accent/15 text-accent border border-accent/40"
                    : "text-secondaryText hover:text-primaryText bg-background/60 border border-border/60"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedGroupId(active ? null : g.id)}
                  className="flex items-center gap-1"
                >
                  <span>/{g.name}</span>
                  <span className="opacity-60">({count})</span>
                </button>
                <button
                  type="button"
                  onClick={() => void deleteGroup(g.id)}
                  className="opacity-0 group-hover:opacity-100 hover:text-error"
                  title={`Delete group ${g.name}`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Compact Developer Tree/Row Host List */}
      <div className="flex-1 overflow-y-auto py-1 divide-y divide-border/20">
        <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-secondaryText flex items-center justify-between">
          <span>HOSTS ({filteredHosts.length})</span>
          <span className="text-[9px] opacity-60">DBL-CLICK CONNECT</span>
        </div>

        {filteredHosts.length === 0 ? (
          <div className="px-3 py-8 text-center text-[11px] font-mono text-secondaryText">
            {hosts.length === 0 ? "-- empty host registry --" : "-- no match --"}
          </div>
        ) : (
          filteredHosts.map((host) => {
            const activeConn = isHostConnected(host.id);
            return (
              <div
                key={host.id}
                onDoubleClick={() => void initiateConnection(host)}
                className={`group relative px-3 ${
                  uiDensity === "comfortable" ? "py-2.5" : "py-2"
                } hover:bg-surface/90 transition-colors cursor-pointer`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        activeConn
                          ? "bg-accent shadow-[0_0_6px_#10B981]"
                          : "bg-border group-hover:bg-secondaryText"
                      }`}
                    />
                    <span className="text-xs font-medium text-primaryText truncate">
                      {host.name}
                    </span>
                    {host.authMethod === "private_key" ? (
                      <span title="Private Key Auth" className="shrink-0">
                        <KeyRound className="w-2.5 h-2.5 text-accent/80" />
                      </span>
                    ) : (
                      <span title="Password Auth" className="shrink-0">
                        <Lock className="w-2.5 h-2.5 text-secondaryText/60" />
                      </span>
                    )}
                  </div>

                  {/* Hover Action Strip */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void initiateConnection(host);
                      }}
                      className="p-1 rounded-xs hover:bg-accent/20 text-accent"
                      title={`Connect to ${host.name}`}
                      aria-label={`Connect to ${host.name}`}
                    >
                      <Play className="w-3 h-3 fill-current" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditHost(host);
                      }}
                      className="p-1 rounded-xs hover:bg-elevated text-secondaryText hover:text-primaryText"
                      title={`Edit ${host.name}`}
                      aria-label={`Edit ${host.name}`}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void duplicateHost(host.id);
                      }}
                      className="p-1 rounded-xs hover:bg-elevated text-secondaryText hover:text-primaryText"
                      title={`Duplicate ${host.name}`}
                      aria-label={`Duplicate ${host.name}`}
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDeleteHostId(host.id);
                      }}
                      className="p-1 rounded-xs hover:bg-error/20 text-secondaryText hover:text-error"
                      title={`Delete ${host.name}`}
                      aria-label={`Delete ${host.name}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="pl-3.5 mt-0.5 flex items-center justify-between gap-2 text-[11px] font-mono text-secondaryText">
                  <span className="truncate">
                    {host.username}@{host.hostname}
                    {host.port !== 22 ? `:${host.port}` : ""}
                  </span>
                  {host.tags.length > 0 && (
                    <span className="text-[9px] text-cyber/80 truncate max-w-[80px]">
                      #{host.tags[0]}
                    </span>
                  )}
                </div>

                {/* Inline Destructive Delete Confirmation */}
                {confirmDeleteHostId === host.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="mt-2 p-1.5 rounded-xs bg-background border border-error/50 flex items-center justify-between text-[10px] font-mono"
                  >
                    <span className="text-error">rm {host.name}?</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteHostId(null)}
                        className="px-1.5 py-0.5 rounded-xs bg-surface text-secondaryText hover:text-primaryText"
                      >
                        no
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDeleteHostId(null);
                          void deleteHost(host.id);
                        }}
                        className="px-1.5 py-0.5 rounded-xs bg-error text-white font-semibold"
                      >
                        Confirm Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Sleek Monospace Footer */}
      <div className="p-2 border-t border-border bg-background/40">
        <button
          type="button"
          onClick={onOpenSettings}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xs hover:bg-surface border border-transparent hover:border-border text-[11px] font-mono text-secondaryText hover:text-primaryText transition-colors"
        >
          <span className="flex items-center gap-2">
            <Settings className="w-3.5 h-3.5 text-accent" />
            <span>{t("settings")}</span>
          </span>
          <kbd className="text-[10px] px-1 bg-background border border-border rounded-xs">
            Ctrl+,
          </kbd>
        </button>
      </div>
    </aside>
  );
};
