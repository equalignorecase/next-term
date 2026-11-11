import React from "react";
import {
  ShieldCheck,
  Terminal,
  PanelLeft,
  Cpu,
  MemoryStick,
  Activity,
  Sun,
  Moon,
} from "lucide-react";

import { resolveThemePreset } from "@/lib/themes";
import { useAppStore } from "@/store/useAppStore";

interface StatusBarProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export function renderMiniBar(percent: number, slots = 5): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * slots);
  return `[${"■".repeat(filled)}${"░".repeat(Math.max(0, slots - filled))}]`;
}

export function getLoadColorClass(percent: number): string {
  if (percent >= 90) return "text-error font-semibold";
  if (percent >= 70) return "text-warning font-semibold";
  return "text-accent";
}

export function formatBytesToGb(bytes: number): string {
  if (bytes <= 0) return "0.00";
  const gb = bytes / (1024 * 1024 * 1024);
  return gb.toFixed(2);
}

export function formatRateCompact(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
  const kb = bytesPerSec / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB/s`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB/s`;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  sidebarCollapsed,
  onToggleSidebar,
}) => {
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const settings = useAppStore((s) => s.settings);
  const toggleTheme = useAppStore((s) => s.toggleTheme);

  const activeTab = tabs.find((t) => t.sessionId === activeTabId) ?? null;
  const telemetry = activeTab?.telemetry ?? null;
  const activePreset = resolveThemePreset(settings.theme);

  const getModeSegment = () => {
    if (!activeTab) {
      return {
        label: "STANDBY",
        className: "bg-elevated text-secondaryText border-r border-border",
      };
    }
    switch (activeTab.state) {
      case "Connected":
        return {
          label: "SSH // LIVE",
          className: "bg-accent text-slate-950 font-bold",
        };
      case "Connecting":
      case "VerifyingHost":
      case "Authenticating":
        return {
          label: activeTab.state.toUpperCase(),
          className: "bg-warning text-slate-950 font-bold animate-pulse",
        };
      case "Failed":
        return {
          label: `ERR // ${activeTab.errorCode ?? "FAULT"}`,
          className: "bg-error text-white font-bold",
        };
      default:
        return {
          label: activeTab.state.toUpperCase(),
          className: "bg-elevated text-secondaryText border-r border-border",
        };
    }
  };

  const mode = getModeSegment();

  return (
    <footer className="h-6 shrink-0 bg-sidebar border-t border-border flex items-stretch justify-between text-[11px] font-mono text-secondaryText select-none overflow-hidden">
      {/* Left Lualine-style Segments */}
      <div className="flex items-stretch min-w-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="px-2 flex items-center gap-1 bg-background hover:bg-surface border-r border-border text-secondaryText hover:text-primaryText transition-colors shrink-0"
          title="Toggle Sidebar (Ctrl+B)"
          aria-label="Toggle Sidebar"
        >
          <PanelLeft className="w-3 h-3" />
          <span className="text-[10px]">
            {sidebarCollapsed ? "SHOW" : "HIDE"}
          </span>
        </button>

        <div
          className={`px-2.5 flex items-center tracking-wider shrink-0 ${mode.className}`}
        >
          {mode.label}
        </div>

        {activeTab ? (
          <div className="px-2.5 flex items-center gap-2 bg-surface/60 border-r border-border text-primaryText truncate">
            <span>
              {activeTab.username}@{activeTab.hostname}:{activeTab.port}
            </span>
          </div>
        ) : (
          <div className="px-3 flex items-center text-secondaryText/70 border-r border-border">
            no active channel
          </div>
        )}
      </div>

      {/* Right Telemetry & Terminal Info Segments */}
      <div className="flex items-stretch shrink-0 divide-x divide-border border-l border-border">
        {activeTab &&
          activeTab.state === "Connected" &&
          settings.telemetryEnabled && (
          <>
            {telemetry ? (
              <>
                {/* Remote CPU Segment */}
                <div
                  className="px-2.5 flex items-center gap-1.5 bg-background/60"
                  data-testid="telemetry-cpu"
                  title={`Remote CPU Usage: ${telemetry.cpuPercent.toFixed(1)}%`}
                >
                  <Cpu className="w-3 h-3 text-secondaryText" />
                  <span className="text-primaryText">CPU</span>
                  <span className={getLoadColorClass(telemetry.cpuPercent)}>
                    {renderMiniBar(telemetry.cpuPercent)}{" "}
                    {Math.round(telemetry.cpuPercent)}%
                  </span>
                </div>

                {/* Remote RAM Segment */}
                <div
                  className="px-2.5 flex items-center gap-1.5 bg-background/60"
                  data-testid="telemetry-mem"
                  title={`Remote Memory: ${formatBytesToGb(
                    telemetry.memUsedBytes
                  )} / ${formatBytesToGb(telemetry.memTotalBytes)} GB`}
                >
                  <MemoryStick className="w-3 h-3 text-secondaryText" />
                  <span className="text-primaryText">RAM</span>
                  <span className="text-secondaryText">
                    {formatBytesToGb(telemetry.memUsedBytes)} /{" "}
                    {formatBytesToGb(telemetry.memTotalBytes)} GB
                  </span>
                  <span className="text-border">·</span>
                  <span className={getLoadColorClass(telemetry.memPercent)}>
                    {Math.round(telemetry.memPercent)}%
                  </span>
                </div>

                {/* Remote Network RX/TX Segment */}
                <div
                  className="px-2.5 flex items-center gap-1.5 bg-background/60"
                  data-testid="telemetry-net"
                  title="Remote Network Throughput"
                >
                  <Activity className="w-3 h-3 text-cyber" />
                  <span className="text-primaryText">NET</span>
                  <span className="text-accent">
                    ↓ {formatRateCompact(telemetry.netRxBytesPerSec)}
                  </span>
                  <span className="text-cyber">
                    ↑ {formatRateCompact(telemetry.netTxBytesPerSec)}
                  </span>
                </div>
              </>
            ) : (
              <div className="px-2.5 flex items-center gap-1.5 bg-background/40 text-secondaryText/70">
                <Activity className="w-3 h-3 animate-pulse text-accent" />
                <span>telemetry...</span>
              </div>
            )}
          </>
        )}

        {activeTab && (
          <div className="px-2.5 flex items-center gap-1.5 bg-background/50 text-primaryText">
            <Terminal className="w-3 h-3 text-accent" />
            <span>
              {activeTab.cols}x{activeTab.rows}
            </span>
          </div>
        )}

        <div className="px-2.5 hidden sm:flex items-center bg-background/30">
          {settings.terminalType}
        </div>

        <button
          type="button"
          onClick={() => void toggleTheme()}
          className="px-2.5 flex items-center gap-1.5 bg-background hover:bg-surface text-secondaryText hover:text-primaryText transition-colors"
          title={
            !activePreset.isLight
              ? "Switch to Light Mode"
              : "Switch to Dark Mode"
          }
          aria-label="Status Bar Toggle Theme"
        >
          {!activePreset.isLight ? (
            <>
              <Moon className="w-3 h-3 text-accent" />
              <span>DARK</span>
            </>
          ) : (
            <>
              <Sun className="w-3 h-3 text-warning" />
              <span>LIGHT</span>
            </>
          )}
        </button>

        <div className="px-2.5 hidden md:flex items-center gap-1.5 bg-background text-secondaryText">
          <ShieldCheck className="w-3 h-3 text-accent" />
          <span>SHA256-TOFU</span>
        </div>
      </div>
    </footer>
  );
};
