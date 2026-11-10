import React from "react";
import { ShieldCheck, Wifi, WifiOff, AlertCircle, Terminal } from "lucide-react";

import { useAppStore } from "@/store/useAppStore";

export const StatusBar: React.FC = () => {
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const settings = useAppStore((s) => s.settings);

  const activeTab = tabs.find((t) => t.sessionId === activeTabId) ?? null;

  const renderStatusBadge = () => {
    if (!activeTab) {
      return (
        <span className="flex items-center gap-1.5 text-secondaryText">
          <WifiOff className="w-3 h-3" />
          <span>Idle — No active session</span>
        </span>
      );
    }

    switch (activeTab.state) {
      case "Connected":
        return (
          <span className="flex items-center gap-1.5 text-success font-medium">
            <Wifi className="w-3 h-3" />
            <span>Connected</span>
          </span>
        );
      case "Connecting":
      case "VerifyingHost":
      case "Authenticating":
        return (
          <span className="flex items-center gap-1.5 text-warning font-medium">
            <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
            <span>{activeTab.state}</span>
          </span>
        );
      case "Failed":
        return (
          <span className="flex items-center gap-1.5 text-error font-medium">
            <AlertCircle className="w-3 h-3" />
            <span>Error ({activeTab.errorCode ?? "FAILED"})</span>
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 text-secondaryText">
            <WifiOff className="w-3 h-3" />
            <span>{activeTab.state}</span>
          </span>
        );
    }
  };

  return (
    <footer className="h-7 shrink-0 bg-sidebar border-t border-border px-3 flex items-center justify-between text-[11px] text-secondaryText select-none">
      <div className="flex items-center gap-4 min-w-0">
        {renderStatusBadge()}

        {activeTab && (
          <>
            <span className="text-border">|</span>
            <span className="font-mono text-primaryText truncate">
              {activeTab.username}@{activeTab.hostname}:{activeTab.port}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-4 shrink-0">
        {activeTab && (
          <>
            <span className="flex items-center gap-1 font-mono">
              <Terminal className="w-3 h-3 text-accent" />
              {activeTab.cols}×{activeTab.rows}
            </span>
            <span className="text-border">|</span>
          </>
        )}
        <span className="font-mono">{settings.terminalType}</span>
        <span className="text-border">|</span>
        <span className="flex items-center gap-1 text-secondaryText">
          <ShieldCheck className="w-3 h-3 text-success" />
          Host Key Verification Enforced
        </span>
      </div>
    </footer>
  );
};

