import React, { useCallback, useEffect, useState } from "react";
import {
  Folder,
  FileText,
  Upload,
  Download,
  RefreshCw,
  FolderPlus,
  Trash2,
  CornerLeftUp,
  X,
  HardDriveUpload,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";

import { ipc } from "@/lib/ipc";
import { formatError } from "@/lib/utils";
import type { SftpEntry } from "@/types/models";

interface SftpDrawerProps {
  sessionId: string;
  isConnected: boolean;
  open: boolean;
  onClose: () => void;
  currentPath: string;
  onPathChange: (nextPath: string) => void;
  externalRefreshToken: number;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

function getParentPath(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  if (!trimmed || trimmed === "/") return "/";
  const idx = trimmed.lastIndexOf("/");
  if (idx <= 0) return "/";
  return trimmed.slice(0, idx);
}

export const SftpDrawer: React.FC<SftpDrawerProps> = ({
  sessionId,
  isConnected,
  open,
  onClose,
  currentPath,
  onPathChange,
  externalRefreshToken,
}) => {
  const [entries, setEntries] = useState<SftpEntry[]>([]);
  const [pathInput, setPathInput] = useState(currentPath || ".");
  const [loading, setLoading] = useState(false);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [confirmDeletePath, setConfirmDeletePath] = useState<string | null>(
    null
  );

  const flashNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3200);
  };

  const loadDirectory = useCallback(
    async (targetPath?: string) => {
      if (!isConnected) return;
      setLoading(true);
      setError(null);
      try {
        const res = await ipc.sftpListDir(
          sessionId,
          targetPath ?? (currentPath || ".")
        );
        setEntries(res.entries);
        onPathChange(res.currentPath);
        setPathInput(res.currentPath);
      } catch (err) {
        setError(formatError(err).message);
      } finally {
        setLoading(false);
      }
    },
    [sessionId, isConnected, currentPath, onPathChange]
  );

  useEffect(() => {
    if (open && isConnected) {
      void loadDirectory(currentPath || ".");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isConnected, sessionId, externalRefreshToken]);

  if (!open) return null;

  const handleNavigateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pathInput.trim()) return;
    void loadDirectory(pathInput.trim());
  };

  const handleUploadClick = async () => {
    setError(null);
    const files = await ipc.pickLocalFilesForUpload();
    if (files.length === 0) return;

    setBusyMessage(`Uploading ${files.length} file(s)...`);
    try {
      let totalBytes = 0;
      for (const localPath of files) {
        const res = await ipc.sftpUploadFile(
          sessionId,
          localPath,
          currentPath || "."
        );
        totalBytes += res.bytesTransferred;
      }
      flashNotice(
        `Uploaded ${files.length} file(s) (${formatFileSize(totalBytes)})`
      );
      await loadDirectory(currentPath || ".");
    } catch (err) {
      setError(formatError(err).message);
    } finally {
      setBusyMessage(null);
    }
  };

  const handleDownloadFile = async (entry: SftpEntry) => {
    setError(null);
    const localSavePath = await ipc.pickLocalSavePath(entry.name);
    if (!localSavePath) return;

    setBusyMessage(`Downloading ${entry.name}...`);
    try {
      const res = await ipc.sftpDownloadFile(
        sessionId,
        entry.path,
        localSavePath
      );
      flashNotice(
        `Downloaded ${entry.name} (${formatFileSize(res.bytesTransferred)})`
      );
    } catch (err) {
      setError(formatError(err).message);
    } finally {
      setBusyMessage(null);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    setError(null);
    const base = (currentPath || ".").replace(/\/+$/, "");
    const fullPath = base === "" || base === "/" ? `/${trimmed}` : `${base}/${trimmed}`;

    setBusyMessage(`Creating ${trimmed}...`);
    try {
      await ipc.sftpCreateDir(sessionId, fullPath);
      setNewFolderName("");
      setCreatingFolder(false);
      flashNotice(`Created folder ${trimmed}`);
      await loadDirectory(currentPath || ".");
    } catch (err) {
      setError(formatError(err).message);
    } finally {
      setBusyMessage(null);
    }
  };

  const handleDeleteEntry = async (entry: SftpEntry) => {
    setError(null);
    setConfirmDeletePath(null);
    setBusyMessage(`Deleting ${entry.name}...`);
    try {
      await ipc.sftpDeleteEntry(
        sessionId,
        entry.path,
        entry.kind === "directory"
      );
      flashNotice(`Deleted ${entry.name}`);
      await loadDirectory(currentPath || ".");
    } catch (err) {
      setError(formatError(err).message);
    } finally {
      setBusyMessage(null);
    }
  };

  return (
    <aside
      data-testid="sftp-drawer"
      aria-label="SFTP File Manager"
      className="w-80 shrink-0 bg-sidebar border-l border-border flex flex-col h-full select-none font-mono text-xs"
    >
      {/* Header */}
      <div className="h-9 shrink-0 px-3 border-b border-border bg-background/40 flex items-center justify-between">
        <div className="flex items-center gap-2 text-primaryText font-bold">
          <HardDriveUpload className="w-3.5 h-3.5 text-accent" />
          <span>SFTP // FILES</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={!isConnected || loading || Boolean(busyMessage)}
            onClick={() => void handleUploadClick()}
            className="flex items-center gap-1 px-2 py-0.5 rounded-xs bg-accent text-slate-950 font-semibold text-[11px] hover:opacity-90 disabled:opacity-40"
            title="Upload file(s) from PC to current remote directory"
          >
            <Upload className="w-3 h-3" />
            <span>Upload</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-secondaryText hover:text-primaryText rounded-xs"
            aria-label="Close SFTP drawer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Path Bar & Toolbar */}
      <div className="p-2 border-b border-border space-y-1.5 bg-surface/40">
        <form onSubmit={handleNavigateSubmit} className="flex items-center gap-1">
          <button
            type="button"
            disabled={!isConnected || loading}
            onClick={() => void loadDirectory(getParentPath(currentPath || "/"))}
            className="p-1 rounded-xs bg-background border border-border text-secondaryText hover:text-primaryText disabled:opacity-40"
            title="Parent directory (..)"
            aria-label="Parent directory"
          >
            <CornerLeftUp className="w-3.5 h-3.5" />
          </button>
          <input
            type="text"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            placeholder="/remote/path"
            aria-label="Remote directory path"
            className="flex-1 min-w-0 px-2 py-1 text-[11px] bg-background border border-border rounded-xs text-primaryText focus:outline-none focus:border-accent"
          />
          <button
            type="button"
            disabled={!isConnected || loading}
            onClick={() => setCreatingFolder((v) => !v)}
            className="p-1 rounded-xs bg-background border border-border text-secondaryText hover:text-accent disabled:opacity-40"
            title="New remote folder"
            aria-label="New remote folder"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!isConnected || loading}
            onClick={() => void loadDirectory(currentPath || ".")}
            className="p-1 rounded-xs bg-background border border-border text-secondaryText hover:text-primaryText disabled:opacity-40"
            title="Refresh directory"
            aria-label="Refresh directory"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? "animate-spin text-accent" : ""}`}
            />
          </button>
        </form>

        {creatingFolder && (
          <form onSubmit={handleCreateFolder} className="flex items-center gap-1">
            <input
              type="text"
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="new_folder_name"
              className="flex-1 px-2 py-1 text-[11px] bg-background border border-border rounded-xs text-primaryText focus:outline-none focus:border-accent"
            />
            <button
              type="submit"
              className="px-2 py-1 text-[10px] bg-accent text-slate-950 font-semibold rounded-xs"
            >
              MKDIR
            </button>
          </form>
        )}
      </div>

      {/* Status / Error / Busy Banners */}
      {busyMessage && (
        <div className="px-3 py-1.5 bg-sidebar border-b border-border flex items-center gap-2 text-[11px] text-accent">
          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
          <span className="truncate">{busyMessage}</span>
        </div>
      )}

      {notice && (
        <div className="px-3 py-1.5 bg-accent/15 border-b border-accent/40 flex items-center gap-2 text-[11px] text-accent">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{notice}</span>
        </div>
      )}

      {error && (
        <div className="px-3 py-1.5 bg-error/15 border-b border-error/40 flex items-center justify-between gap-2 text-[11px] text-error">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate" title={error}>
              {error}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="shrink-0 hover:text-white"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* File List */}
      <div className="flex-1 overflow-y-auto divide-y divide-border/20">
        {!isConnected ? (
          <div className="p-6 text-center text-secondaryText text-[11px]">
            Wait for SSH session to connect before browsing SFTP files.
          </div>
        ) : entries.length === 0 && !loading ? (
          <div className="p-6 text-center text-secondaryText text-[11px]">
            -- empty directory --
          </div>
        ) : (
          entries.map((entry) => {
            const isDir = entry.kind === "directory";
            return (
              <div
                key={entry.path}
                onDoubleClick={() => {
                  if (isDir) {
                    void loadDirectory(entry.path);
                  } else {
                    void handleDownloadFile(entry);
                  }
                }}
                className="group px-3 py-1.5 hover:bg-surface/90 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {isDir ? (
                      <Folder className="w-3.5 h-3.5 text-accent shrink-0" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-secondaryText shrink-0" />
                    )}
                    <span
                      className={`truncate ${
                        isDir
                          ? "text-primaryText font-semibold"
                          : "text-primaryText/90"
                      }`}
                      title={entry.name}
                    >
                      {entry.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {!isDir && (
                      <span className="text-[10px] text-secondaryText group-hover:hidden">
                        {formatFileSize(entry.size)}
                      </span>
                    )}

                    <div className="hidden group-hover:flex items-center gap-0.5">
                      {!isDir && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleDownloadFile(entry);
                          }}
                          className="p-1 rounded-xs hover:bg-elevated text-accent"
                          title={`Download ${entry.name}`}
                          aria-label={`Download ${entry.name}`}
                        >
                          <Download className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeletePath(entry.path);
                        }}
                        className="p-1 rounded-xs hover:bg-error/20 text-secondaryText hover:text-error"
                        title={`Delete ${entry.name}`}
                        aria-label={`Delete ${entry.name}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {confirmDeletePath === entry.path && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1.5 p-1.5 rounded-xs bg-background border border-error/50 flex items-center justify-between text-[10px]"
                  >
                    <span className="text-error truncate">
                      rm {entry.name}?
                    </span>
                    <div className="flex gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setConfirmDeletePath(null)}
                        className="px-1.5 py-0.5 rounded-xs bg-surface text-secondaryText"
                      >
                        no
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteEntry(entry)}
                        className="px-1.5 py-0.5 rounded-xs bg-error text-white font-semibold"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Drag & Drop Hint */}
      <div className="px-3 py-1.5 border-t border-border bg-background/50 text-[10px] text-secondaryText flex items-center justify-between">
        <span>Drag & drop files from PC to upload</span>
        <span className="text-accent">{entries.length} items</span>
      </div>
    </aside>
  );
};

