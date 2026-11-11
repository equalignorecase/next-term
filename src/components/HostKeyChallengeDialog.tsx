import React, { useState } from "react";
import { ShieldAlert, ShieldQuestion, Check, X } from "lucide-react";

import { useAppStore } from "@/store/useAppStore";
import type { HostKeyChallengeEvent } from "@/types/models";

interface HostKeyChallengeDialogProps {
  challenge: HostKeyChallengeEvent;
}

export const HostKeyChallengeDialog: React.FC<HostKeyChallengeDialogProps> = ({
  challenge,
}) => {
  const resolveHostKeyChallenge = useAppStore((s) => s.resolveHostKeyChallenge);
  const [persist, setPersist] = useState(true);
  const [confirmChangedOverride, setConfirmChangedOverride] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isChanged = challenge.status === "changed";

  const handleDecision = async (trust: boolean) => {
    setIsSubmitting(true);
    try {
      await resolveHostKeyChallenge(challenge.sessionId, trust, persist);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="host-key-dialog-title"
    >
      <div
        className={`w-full max-w-lg bg-surface border rounded-lg shadow-2xl overflow-hidden ${
          isChanged ? "border-error" : "border-warning/60"
        }`}
      >
        <div
          className={`flex items-center gap-2.5 px-5 py-3.5 border-b ${
            isChanged
              ? "bg-error/15 border-error/40 text-error"
              : "bg-warning/10 border-warning/30 text-warning"
          }`}
        >
          {isChanged ? (
            <ShieldAlert className="w-5 h-5 shrink-0" />
          ) : (
            <ShieldQuestion className="w-5 h-5 shrink-0" />
          )}
          <h2 id="host-key-dialog-title" className="text-sm font-semibold">
            {isChanged
              ? "SECURITY WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!"
              : "Verify Unknown SSH Server Host Key"}
          </h2>
        </div>

        <div className="p-5 space-y-4 text-xs text-secondaryText">
          {isChanged ? (
            <div className="p-3 rounded bg-error/10 border border-error/30 text-primaryText space-y-1.5 leading-relaxed">
              <p className="font-semibold text-error">
                Potential Man-in-the-Middle (MITM) Attack Detected!
              </p>
              <p>
                The host key presented by{" "}
                <span className="font-mono font-semibold">
                  {challenge.hostIdentity}
                </span>{" "}
                does not match the key previously trusted in your Known Hosts
                store. Someone could be eavesdropping on your connection right
                now, or the server administrator may have recently rotated the
                host key.
              </p>
            </div>
          ) : (
            <p className="leading-relaxed text-primaryText">
              The authenticity of host{" "}
              <span className="font-mono font-semibold text-accent">
                {challenge.hostIdentity}
              </span>{" "}
              cannot be established automatically because this is your first
              time connecting to it.
            </p>
          )}

          <div className="p-3.5 rounded bg-background border border-border space-y-2 font-mono text-[11px]">
            <div className="flex justify-between gap-2">
              <span className="text-secondaryText">Host Identity:</span>
              <span className="text-primaryText font-semibold">
                {challenge.hostIdentity}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-secondaryText">Algorithm:</span>
              <span className="text-primaryText">{challenge.keyAlgorithm}</span>
            </div>
            <div className="space-y-1 pt-1 border-t border-border/60">
              <span className="text-secondaryText block">
                Server SHA-256 Fingerprint:
              </span>
              <div className="p-2 rounded bg-surface text-accent break-all select-all font-semibold">
                {challenge.fingerprint}
              </div>
            </div>
            {isChanged && challenge.previousFingerprint && (
              <div className="space-y-1 pt-1 border-t border-border/60">
                <span className="text-secondaryText block">
                  Previously Trusted Fingerprint:
                </span>
                <div className="p-2 rounded bg-surface text-warning break-all select-all">
                  {challenge.previousFingerprint}
                </div>
              </div>
            )}
          </div>

          {isChanged && (
            <label className="flex items-start gap-2.5 p-2.5 rounded bg-error/10 border border-error/30 text-primaryText cursor-pointer">
              <input
                type="checkbox"
                checked={confirmChangedOverride}
                onChange={(e) => setConfirmChangedOverride(e.target.checked)}
                className="mt-0.5 rounded border-border"
              />
              <span>
                I have verified out-of-band with the server administrator that
                this new fingerprint is legitimate and want to replace the
                existing key.
              </span>
            </label>
          )}

          <label className="flex items-center gap-2 text-secondaryText cursor-pointer select-none">
            <input
              type="checkbox"
              checked={persist}
              onChange={(e) => setPersist(e.target.checked)}
              className="rounded border-border text-accent"
            />
            <span>
              {isChanged
                ? "Replace trusted host key in Known Hosts database"
                : "Save and trust this host key in Known Hosts for future connections"}
            </span>
          </label>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => void handleDecision(false)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-elevated hover:bg-border text-primaryText font-semibold transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Reject & Disconnect
            </button>

            <button
              type="button"
              disabled={isSubmitting || (isChanged && !confirmChangedOverride)}
              onClick={() => void handleDecision(true)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xs font-mono font-semibold transition-colors disabled:opacity-40 ${
                isChanged
                  ? "bg-error text-white hover:bg-red-500"
                  : "bg-accent text-slate-950 hover:bg-emerald-400"
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              {isChanged ? "Replace Key & Connect" : "Trust Key & Connect"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

