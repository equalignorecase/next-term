import React, { useState } from "react";
import {
  TerminalSquare,
  Plus,
  Search,
  Settings,
  Server,
  Folder,
  FolderPlus,
  Play,
  Pencil,
  Copy,
  Trash2,
  KeyRound,
  Lock,
  X,
} from "lucide-react";

import { useAppStore } from "@/store/useAppStore";
import type { Host } from "@/types/models";

interface SidebarProps {
  onAddHost: () => void;
  onEditHost: (host: Host) => void;
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  onAddHost,
  onEditHost,
  onOpenSettings,
}) => {
  const hosts = useAppStore((s) => s.hosts);
  const groups = useAppStore((s) => s.groups);
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

  return (
    <aside className="w-72 shrink-0 bg-sidebar border-r border-border flex flex-col h-full select-none">
      {/* Application Identity Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-accent/15 border border-accent/40 flex items-center justify-center text-accent">
            <TerminalSquare className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-primaryText leading-none">
              NexTerm
            </h1>
            <span className="text-[10px] text-secondaryText">
              Secure SSH Client
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onAddHost}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-accent text-slate-950 hover:bg-blue-400 text-xs font-semibold transition-colors"
          title="Add SSH Host (Ctrl+N)"
        >
          <Plus className="w-3.5 h-3.5" />
          New Host
        </button>
      </div>

      {/* Search Bar */}
      <div className="p-3 border-b border-border">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-secondaryText absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search hosts, IPs, tags..."
            aria-label="Search hosts"
            className="w-full pl-8 pr-7 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:border-accent text-primaryText placeholder:text-secondaryText/60"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 text-secondaryText hover:text-primaryText"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Host Groups Filter */}
      <div className="px-3 py-2.5 border-b border-border space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-secondaryText px-1">
          <span>Groups</span>
          <button
            type="button"
            onClick={() => setAddingGroup((v) => !v)}
            className="hover:text-primaryText p-0.5 rounded"
            title="Create Host Group"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
        </div>

        {addingGroup && (
          <form onSubmit={handleCreateGroup} className="flex gap-1.5 pt-1">
            <input
              type="text"
              autoFocus
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Group name..."
              className="flex-1 px-2 py-1 text-xs bg-background border border-border rounded text-primaryText focus:outline-none focus:border-accent"
            />
            <button
              type="submit"
              className="px-2 py-1 text-xs bg-accent text-slate-950 font-semibold rounded"
            >
              Add
            </button>
          </form>
        )}

        <div className="flex flex-wrap gap-1 pt-0.5">
          <button
            type="button"
            onClick={() => setSelectedGroupId(null)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              selectedGroupId === null
                ? "bg-elevated text-accent border border-accent/30"
                : "text-secondaryText hover:text-primaryText hover:bg-surface"
            }`}
          >
            All ({hosts.length})
          </button>

          {groups.map((g) => {
            const count = hosts.filter((h) => h.groupId === g.id).length;
            const active = selectedGroupId === g.id;
            return (
              <div
                key={g.id}
                className={`group flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                  active
                    ? "bg-elevated text-accent border border-accent/30"
                    : "text-secondaryText hover:text-primaryText hover:bg-surface"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedGroupId(active ? null : g.id)}
                  className="flex items-center gap-1"
                >
                  <Folder className="w-3 h-3" />
                  <span>{g.name}</span>
                  <span className="text-[10px] opacity-75">({count})</span>
                </button>
                <button
                  type="button"
                  onClick={() => void deleteGroup(g.id)}
                  className="opacity-0 group-hover:opacity-100 hover:text-error ml-0.5"
                  title={`Delete group ${g.name}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Host List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filteredHosts.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-secondaryText space-y-2">
            <Server className="w-6 h-6 mx-auto opacity-40" />
            <p>
              {hosts.length === 0
                ? "No SSH hosts configured yet."
                : "No hosts match your filter."}
            </p>
          </div>
        ) : (
          filteredHosts.map((host) => (
            <div
              key={host.id}
              onDoubleClick={() => void initiateConnection(host)}
              className="group relative rounded-md p-2.5 bg-surface/60 hover:bg-elevated border border-transparent hover:border-border transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-primaryText truncate">
                      {host.name}
                    </span>
                    {host.authMethod === "private_key" ? (
                      <span title="Private Key Auth" className="shrink-0">
                        <KeyRound className="w-3 h-3 text-accent" />
                      </span>
                    ) : (
                      <span title="Password Auth" className="shrink-0">
                        <Lock className="w-3 h-3 text-secondaryText" />
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono text-secondaryText truncate mt-0.5">
                    {host.username}@{host.hostname}:{host.port}
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="flex items-center gap-0.5 opacity-90 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void initiateConnection(host);
                    }}
                    className="p-1 rounded hover:bg-accent/20 text-accent"
                    title={`Connect to ${host.name}`}
                    aria-label={`Connect to ${host.name}`}
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditHost(host);
                    }}
                    className="p-1 rounded hover:bg-background text-secondaryText hover:text-primaryText"
                    title={`Edit ${host.name}`}
                    aria-label={`Edit ${host.name}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void duplicateHost(host.id);
                    }}
                    className="p-1 rounded hover:bg-background text-secondaryText hover:text-primaryText"
                    title={`Duplicate ${host.name}`}
                    aria-label={`Duplicate ${host.name}`}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteHostId(host.id);
                    }}
                    className="p-1 rounded hover:bg-error/20 text-secondaryText hover:text-error"
                    title={`Delete ${host.name}`}
                    aria-label={`Delete ${host.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {host.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {host.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.2 text-[10px] rounded bg-background/80 text-secondaryText border border-border/60"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Destructive Delete Confirmation Inline */}
              {confirmDeleteHostId === host.id && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="mt-2 p-2 rounded bg-background border border-error/50 flex items-center justify-between text-[11px]"
                >
                  <span className="text-error font-medium">
                    Delete this host?
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteHostId(null)}
                      className="px-2 py-0.5 rounded bg-surface text-secondaryText hover:text-primaryText"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDeleteHostId(null);
                        void deleteHost(host.id);
                      }}
                      className="px-2 py-0.5 rounded bg-error text-white font-semibold"
                    >
                      Confirm Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer Settings Button */}
      <div className="p-3 border-t border-border bg-sidebar">
        <button
          type="button"
          onClick={onOpenSettings}
          className="w-full flex items-center justify-between px-3 py-2 rounded-md bg-surface hover:bg-elevated border border-border text-xs text-primaryText transition-colors"
        >
          <span className="flex items-center gap-2 font-medium">
            <Settings className="w-3.5 h-3.5 text-accent" />
            Settings & Known Hosts
          </span>
          <span className="text-[10px] text-secondaryText font-mono">
            Ctrl+,
          </span>
        </button>
      </div>
    </aside>
  );
};
