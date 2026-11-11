import React, { useState } from "react";
import { KeyRound, Lock, X } from "lucide-react";

import { useTranslation } from "@/lib/useTranslation";
import { useAppStore } from "@/store/useAppStore";

export const SecretPromptDialog: React.FC = () => {
  const { t } = useTranslation();
  const secretPrompt = useAppStore((s) => s.secretPrompt);
  const closeSecretPrompt = useAppStore((s) => s.closeSecretPrompt);
  const initiateConnection = useAppStore((s) => s.initiateConnection);

  const [secret, setSecret] = useState("");
  const [saveSecret, setSaveSecret] = useState(false);

  if (!secretPrompt) return null;

  const { host, reason, existingSessionId } = secretPrompt;
  const isPassphrase =
    reason === "passphrase_required" || host.authMethod === "private_key";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secret) return;
    const value = secret;
    setSecret("");
    await initiateConnection(host, {
      secret: value,
      saveSecret,
      existingSessionId,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="secret-prompt-title"
    >
      <div className="w-full max-w-md bg-surface border border-border rounded-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-sidebar">
          <div className="flex items-center gap-2">
            {isPassphrase ? (
              <KeyRound className="w-4 h-4 text-accent" />
            ) : (
              <Lock className="w-4 h-4 text-accent" />
            )}
            <h2
              id="secret-prompt-title"
              className="text-sm font-semibold text-primaryText"
            >
              {isPassphrase
                ? t("secretPromptPassphraseTitle")
                : t("secretPromptPasswordTitle")}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeSecretPrompt}
            className="text-secondaryText hover:text-primaryText p-1 rounded"
            aria-label="Close authentication prompt"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-xs text-secondaryText leading-relaxed">
            {reason === "retry_auth" && (
              <span className="block text-error font-medium mb-1">
                Previous authentication attempt was rejected. Please try again.
              </span>
            )}
            Enter the {isPassphrase ? "private key passphrase" : "password"} for{" "}
            <span className="font-mono text-primaryText font-semibold">
              {host.username}@{host.hostname}:{host.port}
            </span>
          </p>

          <div>
            <input
              type="password"
              autoFocus
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={
                isPassphrase ? "Enter key passphrase..." : "Enter password..."
              }
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded focus:outline-none focus:border-accent text-primaryText"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-secondaryText cursor-pointer select-none">
            <input
              type="checkbox"
              checked={saveSecret}
              onChange={(e) => setSaveSecret(e.target.checked)}
              className="rounded border-border text-accent"
            />
            <span>Save securely in OS Keychain for future sessions</span>
          </label>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={closeSecretPrompt}
              className="px-3.5 py-1.5 text-xs text-secondaryText hover:text-primaryText rounded"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={!secret}
              className="px-4 py-1.5 text-xs font-mono font-semibold bg-accent text-slate-950 hover:bg-emerald-400 rounded-xs disabled:opacity-40"
            >
              {t("secretPromptSubmit")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

