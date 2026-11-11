import React, { useEffect, useState } from "react";
import {
  Palette,
  Settings,
  ShieldCheck,
  Terminal,
  Trash2,
  Wifi,
  X,
  Check,
} from "lucide-react";

import {
  ACCENT_SWATCHES,
  THEME_PRESETS,
  VISIBLE_THEME_PRESET_IDS,
  resolveThemePreset,
} from "@/lib/themes";
import { appSettingsSchema } from "@/lib/validation";
import { formatError } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import type { AppSettings, ThemePresetId } from "@/types/models";

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

  const activePreset = resolveThemePreset(draft.theme);
  const normalizedDraftTheme: ThemePresetId =
    draft.theme === "dark" ? "obsidian" : draft.theme;

  const handleSelectPreset = (presetId: ThemePresetId, defaultAccent: string) => {
    setDraft({
      ...draft,
      theme: presetId,
      accentColor: defaultAccent,
    });
  };

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
    >
      <div className="w-full max-w-3xl bg-surface border border-border rounded-md shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-sidebar">
          <div className="flex items-center gap-2 font-mono">
            <Settings className="w-4 h-4 text-accent" />
            <h2
              id="settings-dialog-title"
              className="text-xs font-bold uppercase tracking-wider text-primaryText"
            >
              Settings & Trusted Host Keys
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-secondaryText hover:text-primaryText p-1 rounded-xs"
            aria-label="Close settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sub-navigation */}
        <div className="flex border-b border-border bg-sidebar/60 px-5 gap-5 font-mono">
          <button
            type="button"
            onClick={() => setTab("preferences")}
            className={`py-2.5 text-xs font-medium border-b-2 transition-colors ${
              tab === "preferences"
                ? "border-accent text-accent"
                : "border-transparent text-secondaryText hover:text-primaryText"
            }`}
          >
            Appearance, Terminal & SSH
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
            className="p-5 space-y-6 overflow-y-auto flex-1 text-xs"
          >
            {error && (
              <div className="p-2.5 rounded-xs bg-error/15 border border-error/40 text-error font-mono">
                {error}
              </div>
            )}
            {savedNotice && (
              <div className="p-2.5 rounded-xs bg-success/15 border border-success/40 text-success font-mono">
                Settings saved and applied immediately.
              </div>
            )}

            {/* SECTION 1: THEME PRESETS & ACCENT COLOR */}
            <section className="space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-1.5">
                <div className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-wider text-primaryText">
                  <Palette className="w-3.5 h-3.5 text-accent" />
                  <span>1. Color Theme & Accent Palette</span>
                </div>
                <select
                  aria-label="Application Theme"
                  value={normalizedDraftTheme}
                  onChange={(e) => {
                    const nextId = e.target.value as ThemePresetId;
                    const preset = resolveThemePreset(nextId);
                    handleSelectPreset(nextId, preset.defaultAccent);
                  }}
                  className="px-2.5 py-1 bg-background border border-border rounded-xs text-primaryText font-mono text-[11px]"
                >
                  {VISIBLE_THEME_PRESET_IDS.map((presetId) => {
                    const p = THEME_PRESETS[presetId];
                    return (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.isLight ? "Light" : "Dark"})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Visual Theme Preset Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {VISIBLE_THEME_PRESET_IDS.map((presetId) => {
                  const preset = THEME_PRESETS[presetId];
                  const selected = normalizedDraftTheme === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      data-testid={`theme-card-${preset.id}`}
                      onClick={() =>
                        handleSelectPreset(preset.id, preset.defaultAccent)
                      }
                      className={`group flex flex-col justify-between p-2.5 rounded-xs border text-left transition-all ${
                        selected
                          ? "border-accent bg-elevated/80 ring-1 ring-accent"
                          : "border-border bg-background/60 hover:bg-surface"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 mb-2">
                        <span className="font-mono font-semibold text-[11px] text-primaryText truncate">
                          {preset.name}
                        </span>
                        {selected && (
                          <Check className="w-3 h-3 text-accent shrink-0" />
                        )}
                      </div>

                      {/* Mini Terminal Color Swatch Bar */}
                      <div
                        className="h-5 w-full rounded-xs border border-black/20 flex items-center justify-between px-1.5"
                        style={{ backgroundColor: preset.colors.background }}
                      >
                        <span
                          className="font-mono text-[10px] font-bold"
                          style={{ color: preset.defaultAccent }}
                        >
                          &gt;_
                        </span>
                        <div className="flex items-center gap-1">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: preset.ansi.red }}
                          />
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: preset.ansi.green }}
                          />
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: preset.ansi.blue }}
                          />
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: preset.ansi.magenta }}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Accent Color Swatches + Custom Hex Picker */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 bg-background/50 p-2.5 rounded-xs border border-border">
                <div className="space-y-1">
                  <span className="block font-medium text-secondaryText">
                    Primary Accent & Cursor Highlight
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {ACCENT_SWATCHES.map((swatch) => {
                      const active =
                        draft.accentColor.toUpperCase() ===
                        swatch.hex.toUpperCase();
                      return (
                        <button
                          key={swatch.hex}
                          type="button"
                          title={`${swatch.name} (${swatch.hex})`}
                          aria-label={`Accent ${swatch.name}`}
                          onClick={() =>
                            setDraft({ ...draft, accentColor: swatch.hex })
                          }
                          className={`w-5 h-5 rounded-full flex items-center justify-center border transition-transform ${
                            active
                              ? "scale-110 border-white ring-2 ring-accent"
                              : "border-black/40 opacity-85 hover:opacity-100"
                          }`}
                          style={{ backgroundColor: swatch.hex }}
                        >
                          {active && (
                            <Check className="w-3 h-3 text-slate-950 stroke-[3]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-2 font-mono">
                  <label
                    htmlFor="custom-accent-hex"
                    className="text-[11px] text-secondaryText"
                  >
                    HEX:
                  </label>
                  <input
                    id="custom-accent-hex"
                    type="text"
                    value={draft.accentColor}
                    onChange={(e) =>
                      setDraft({ ...draft, accentColor: e.target.value })
                    }
                    placeholder="#10B981"
                    maxLength={7}
                    className="w-24 px-2 py-1 bg-background border border-border rounded-xs text-primaryText uppercase text-xs"
                  />
                  <input
                    type="color"
                    aria-label="Pick custom accent color"
                    value={
                      /^#[0-9a-fA-F]{6}$/.test(draft.accentColor)
                        ? draft.accentColor
                        : "#10B981"
                    }
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        accentColor: e.target.value.toUpperCase(),
                      })
                    }
                    className="w-7 h-7 bg-transparent border border-border rounded-xs cursor-pointer"
                  />
                </div>
              </div>

              {/* LIVE TERMINAL PREVIEW BOX */}
              <div
                data-testid="live-terminal-preview"
                className="rounded-xs border border-border overflow-hidden shadow-inner"
                style={{
                  backgroundColor: activePreset.colors.background,
                  padding: `${Math.min(draft.terminalPadding, 24)}px`,
                }}
              >
                <div
                  style={{
                    fontFamily: draft.terminalFontFamily,
                    fontSize: `${draft.terminalFontSize}px`,
                    lineHeight: draft.terminalLineHeight,
                    color: activePreset.colors.primaryText,
                  }}
                  className="select-none space-y-0.5"
                >
                  <div className="flex items-center justify-between text-[10px] opacity-60 pb-1 mb-1 border-b border-white/10 font-mono">
                    <span>
                      LIVE PREVIEW // {activePreset.name.toUpperCase()}
                    </span>
                    <span>
                      {draft.terminalFontSize}px · pad {draft.terminalPadding}px
                    </span>
                  </div>
                  <div>
                    <span
                      style={{
                        color: draft.accentColor,
                        fontWeight: 700,
                      }}
                    >
                      dev@prod-node-01
                    </span>
                    <span>:</span>
                    <span style={{ color: activePreset.ansi.blue }}>
                      ~/cluster
                    </span>
                    <span>$ kubectl get pods -n core</span>
                  </div>
                  <div style={{ color: activePreset.ansi.brightBlack }}>
                    NAME &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;READY &nbsp;&nbsp;STATUS &nbsp;&nbsp;&nbsp;RESTARTS &nbsp;&nbsp;AGE
                  </div>
                  <div>
                    <span>api-gateway-7f9c </span>
                    <span style={{ color: activePreset.ansi.green }}>
                      1/1 &nbsp;&nbsp;&nbsp;&nbsp;Running
                    </span>
                    <span> &nbsp;&nbsp;0 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;14d</span>
                  </div>
                  <div className="flex items-center">
                    <span
                      style={{
                        color: draft.accentColor,
                        fontWeight: 700,
                      }}
                    >
                      dev@prod-node-01
                    </span>
                    <span>:</span>
                    <span style={{ color: activePreset.ansi.blue }}>
                      ~/cluster
                    </span>
                    <span>$&nbsp;</span>
                    <span
                      className={draft.cursorBlink ? "animate-pulse" : ""}
                      style={{
                        display: "inline-block",
                        width:
                          draft.cursorStyle === "bar" ? "2px" : "0.6em",
                        height:
                          draft.cursorStyle === "underline" ? "2px" : "1.1em",
                        backgroundColor: draft.accentColor,
                        verticalAlign:
                          draft.cursorStyle === "underline"
                            ? "baseline"
                            : "middle",
                      }}
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* SECTION 2: TERMINAL TYPOGRAPHY & BEHAVIOR */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-wider text-primaryText border-b border-border pb-1.5">
                <Terminal className="w-3.5 h-3.5 text-accent" />
                <span>2. Terminal Typography & Interaction</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                    className="w-full px-3 py-1.5 bg-background border border-border rounded-xs text-primaryText font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-secondaryText mb-1">
                    Right-Click Action
                  </label>
                  <select
                    aria-label="Right-Click Action"
                    value={draft.rightClickBehavior}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        rightClickBehavior: e.target.value as
                          | "context_menu"
                          | "paste",
                      })
                    }
                    className="w-full px-3 py-1.5 bg-background border border-border rounded-xs text-primaryText"
                  >
                    <option value="context_menu">Show Context Menu</option>
                    <option value="paste">Paste Immediately (PuTTY style)</option>
                  </select>
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
                    className="w-full px-3 py-1.5 bg-background border border-border rounded-xs text-primaryText font-mono"
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
                    className="w-full px-3 py-1.5 bg-background border border-border rounded-xs text-primaryText font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-secondaryText mb-1">
                    Viewport Padding (px)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={32}
                    value={draft.terminalPadding}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        terminalPadding: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-1.5 bg-background border border-border rounded-xs text-primaryText font-mono"
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
                    className="w-full px-3 py-1.5 bg-background border border-border rounded-xs text-primaryText"
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
                    className="w-full px-3 py-1.5 bg-background border border-border rounded-xs text-primaryText font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-secondaryText mb-1">
                    Sidebar UI Density
                  </label>
                  <select
                    aria-label="Sidebar UI Density"
                    value={draft.uiDensity}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        uiDensity: e.target.value as "compact" | "comfortable",
                      })
                    }
                    className="w-full px-3 py-1.5 bg-background border border-border rounded-xs text-primaryText"
                  >
                    <option value="compact">Compact (Developer Default)</option>
                    <option value="comfortable">Comfortable</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap gap-5 pt-1">
                <label className="flex items-center gap-2 text-secondaryText cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.cursorBlink}
                    onChange={(e) =>
                      setDraft({ ...draft, cursorBlink: e.target.checked })
                    }
                    className="rounded border-border text-accent"
                  />
                  <span>Enable cursor blinking</span>
                </label>

                <label className="flex items-center gap-2 text-secondaryText cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.copyOnSelect}
                    onChange={(e) =>
                      setDraft({ ...draft, copyOnSelect: e.target.checked })
                    }
                    className="rounded border-border text-accent"
                  />
                  <span>Auto copy selection to clipboard</span>
                </label>

                <label className="flex items-center gap-2 text-secondaryText cursor-pointer">
                  <input
                    type="checkbox"
                    checked={draft.enableBell}
                    onChange={(e) =>
                      setDraft({ ...draft, enableBell: e.target.checked })
                    }
                    className="rounded border-border text-accent"
                  />
                  <span>Enable terminal bell</span>
                </label>
              </div>
            </section>

            {/* SECTION 3: SSH TRANSPORT & LIVE TELEMETRY */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-wider text-primaryText border-b border-border pb-1.5">
                <Wifi className="w-3.5 h-3.5 text-accent" />
                <span>3. SSH Transport & Remote Server Telemetry</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-medium text-secondaryText mb-1">
                    Preferred TERM Type
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
                    className="w-full px-3 py-1.5 bg-background border border-border rounded-xs text-primaryText font-mono"
                  >
                    <option value="xterm-256color">xterm-256color</option>
                    <option value="xterm">xterm</option>
                    <option value="vt100">vt100</option>
                  </select>
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
                    className="w-full px-3 py-1.5 bg-background border border-border rounded-xs text-primaryText font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-secondaryText mb-1">
                    Connect Timeout (secs)
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
                    className="w-full px-3 py-1.5 bg-background border border-border rounded-xs text-primaryText font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-secondaryText mb-1">
                    SSH Keepalive Interval (secs)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={draft.keepaliveIntervalSecs}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        keepaliveIntervalSecs: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-1.5 bg-background border border-border rounded-xs text-primaryText font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-secondaryText mb-1">
                    Telemetry Poll Interval (secs)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    disabled={!draft.telemetryEnabled}
                    value={draft.telemetryIntervalSecs}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        telemetryIntervalSecs: Number(e.target.value),
                      })
                    }
                    className="w-full px-3 py-1.5 bg-background border border-border rounded-xs text-primaryText font-mono disabled:opacity-40"
                  />
                </div>

                <div className="flex items-end pb-1.5">
                  <label className="flex items-center gap-2 text-secondaryText cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.telemetryEnabled}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          telemetryEnabled: e.target.checked,
                        })
                      }
                      className="rounded border-border text-accent"
                    />
                    <span>Enable live CPU / RAM / NET status bar polling</span>
                  </label>
                </div>
              </div>
            </section>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-secondaryText hover:text-primaryText rounded-xs font-mono"
              >
                Close
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 font-mono font-semibold bg-accent text-slate-950 hover:opacity-90 rounded-xs"
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
              <div className="p-8 text-center text-secondaryText border border-dashed border-border rounded-xs font-mono">
                No trusted host keys recorded yet.
              </div>
            ) : (
              <div className="divide-y divide-border border border-border rounded-xs bg-background">
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
                        <span className="px-1.5 py-0.5 text-[10px] rounded-xs bg-elevated text-accent font-mono">
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
                      className="flex items-center gap-1 px-2.5 py-1 rounded-xs bg-error/15 hover:bg-error/25 text-error transition-colors font-mono"
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
