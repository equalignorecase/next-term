import React, { useEffect, useState } from "react";
import { Settings, ShieldCheck, Trash2, X } from "lucide-react";

import { appSettingsSchema } from "@/lib/validation";
import { formatError } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import type { AppSettings } from "@/types/models";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open,
  onClose,
}) => {
  const settings = useAppStore((s) => s.settings);
  const knownHosts = useAppStore((s) => s.knownHosts);
  const saveSettings = useAppStore((s) => s.saveSettings);
  const refreshKnownHosts = useAppStore((s) => s.refreshKnownHosts);
  const deleteKnownHost = useAppStore((s) => s.deleteKnownHost);

  const [tab, setTab] = useState<"preferences" | "known_hosts">("preferences");
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(settings);
      setError(null);
      setSavedNotice(false);
      void refreshKnownHosts();
    }
  }, [open, settings, refreshKnownHosts]);

  if (!open) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavedNotice(false);

    const parsed = appSettingsSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid settings values");
      return;
    }

    try {
      await saveSettings(parsed.data);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2000);
    } catch (err) {
      setError(formatError(err).message);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
    >
      <div className="w-full max-w-2xl bg-surface border border-border rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-sidebar">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-accent" />
            <h2
              id="settings-dialog-title"
              className="text-sm font-semibold text-primaryText"
            >
              Settings & Trusted Host Keys
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-secondaryText hover:text-primaryText p-1 rounded"
            aria-label="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sub-navigation */}
        <div className="flex border-b border-border bg-sidebar/50 px-5 gap-4">
          <button
            type="button"
            onClick={() => setTab("preferences")}
            className={`py-2.5 text-xs font-medium border-b-2 transition-colors ${
              tab === "preferences"
                ? "border-accent text-accent"
                : "border-transparent text-secondaryText hover:text-primaryText"
            }`}
          >
            Terminal & Connection Preferences
          </button>
          <button
            type="button"
            onClick={() => setTab("known_hosts")}
            className={`flex items-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              tab === "known_hosts"
                ? "border-accent text-accent"
                : "border-transparent text-secondaryText hover:text-primaryText"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Trusted Known Hosts ({knownHosts.length})
          </button>
        </div>

        {tab === "preferences" ? (
          <form
            onSubmit={handleSave}
            className="p-5 space-y-4 overflow-y-auto flex-1 text-xs"
          >
            {error && (
              <div className="p-2.5 rounded bg-error/15 border border-error/40 text-error">
                {error}
              </div>
            )}
            {savedNotice && (
              <div className="p-2.5 rounded bg-success/15 border border-success/40 text-success">
                Settings saved and applied immediately.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-secondaryText mb-1">
                  Application Theme
                </label>
                <select
                  value={draft.theme}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      theme: e.target.value as "dark" | "light",
                    })
                  }
                  className="w-full px-3 py-1.5 bg-background border border-border rounded text-primaryText"
                >
                  <option value="dark">Dark (Charcoal Default)</option>
                  <option value="light">Light</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-secondaryText mb-1">
                  Preferred Terminal Type (TERM)
                </label>
                <select
                  value={draft.terminalType}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      terminalType: e.target.value as
                        | "xterm-256color"
                        | "xterm"
                        | "vt100",
                    })
                  }
                  className="w-full px-3 py-1.5 bg-background border border-border rounded text-primaryText font-mono"
                >
                  <option value="xterm-256color">xterm-256color</option>
                  <option value="xterm">xterm</option>
                  <option value="vt100">vt100</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block font-medium text-secondaryText mb-1">
                  Terminal Font Family
                </label>
                <input
                  type="text"
                  value={draft.terminalFontFamily}
                  onChange={(e) =>
                    setDraft({ ...draft, terminalFontFamily: e.target.value })
                  }
                  className="w-full px-3 py-1.5 bg-background border border-border rounded text-primaryText font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-secondaryText mb-1">
                  Font Size (px)
                </label>
                <input
                  type="number"
                  min={8}
                  max={36}
                  value={draft.terminalFontSize}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      terminalFontSize: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-1.5 bg-background border border-border rounded text-primaryText font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-secondaryText mb-1">
                  Line Height
                </label>
                <input
                  type="number"
                  step="0.05"
                  min={1.0}
                  max={2.5}
                  value={draft.terminalLineHeight}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      terminalLineHeight: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-1.5 bg-background border border-border rounded text-primaryText font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-secondaryText mb-1">
                  Cursor Style
                </label>
                <select
                  value={draft.cursorStyle}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      cursorStyle: e.target.value as
                        | "block"
                        | "underline"
                        | "bar",
                    })
                  }
                  className="w-full px-3 py-1.5 bg-background border border-border rounded text-primaryText"
                >
                  <option value="block">Block</option>
                  <option value="underline">Underline</option>
                  <option value="bar">Vertical Bar</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-secondaryText mb-1">
                  Scrollback Buffer (lines)
                </label>
                <input
                  type="number"
                  min={100}
                  max={100000}
                  value={draft.scrollback}
                  onChange={(e) =>
                    setDraft({ ...draft, scrollback: Number(e.target.value) })
                  }
                  className="w-full px-3 py-1.5 bg-background border border-border rounded text-primaryText font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-secondaryText mb-1">
                  Connection Timeout (seconds)
                </label>
                <input
                  type="number"
                  min={3}
                  max={300}
                  value={draft.connectionTimeoutSecs}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      connectionTimeoutSecs: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-1.5 bg-background border border-border rounded text-primaryText font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-secondaryText mb-1">
                  Default SSH Port
                </label>
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={draft.defaultSshPort}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      defaultSshPort: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-1.5 bg-background border border-border rounded text-primaryText font-mono"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-secondaryText cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={draft.cursorBlink}
                onChange={(e) =>
                  setDraft({ ...draft, cursorBlink: e.target.checked })
                }
                className="rounded border-border text-accent"
              />
              <span>Enable terminal cursor blinking</span>
            </label>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-secondaryText hover:text-primaryText rounded"
              >
                Close
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 font-semibold bg-accent text-slate-950 hover:bg-blue-400 rounded"
              >
                Save Preferences
              </button>
            </div>
          </form>
        ) : (
          <div className="p-5 space-y-3 overflow-y-auto flex-1 text-xs">
            <p className="text-secondaryText">
              Trusted SSH server public keys stored in SQLite (`known_hosts`).
              Revoking a key will require interactive fingerprint verification on
              the next connection.
            </p>

            {knownHosts.length === 0 ? (
              <div className="p-8 text-center text-secondaryText border border-dashed border-border rounded">
                No trusted host keys recorded yet.
              </div>
            ) : (
              <div className="divide-y divide-border border border-border rounded bg-background">
                {knownHosts.map((kh) => (
                  <div
                    key={kh.id}
                    className="flex items-center justify-between p-3 gap-3"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-primaryText">
                          {kh.hostIdentity}
                        </span>
                        <span className="px-1.5 py-0.5 text-[10px] rounded bg-elevated text-accent font-mono">
                          {kh.keyAlgorithm}
                        </span>
                      </div>
                      <div className="font-mono text-[11px] text-secondaryText truncate">
                        {kh.fingerprint}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void deleteKnownHost(kh.id)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-error/15 hover:bg-error/25 text-error transition-colors"
                      title="Revoke trusted key"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

