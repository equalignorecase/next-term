import React, { useEffect, useState } from "react";
import { X, FolderOpen, KeyRound, Lock, Server } from "lucide-react";

import { hostInputSchema } from "@/lib/validation";
import { ipc } from "@/lib/ipc";
import { formatError } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import type { AuthMethod, Host, HostInput } from "@/types/models";

interface HostDialogProps {
  open: boolean;
  editingHost: Host | null;
  onClose: () => void;
}

export const HostDialog: React.FC<HostDialogProps> = ({
  open,
  editingHost,
  onClose,
}) => {
  const groups = useAppStore((s) => s.groups);
  const defaultPort = useAppStore((s) => s.settings.defaultSshPort);
  const createHost = useAppStore((s) => s.createHost);
  const updateHost = useAppStore((s) => s.updateHost);

  const [name, setName] = useState("");
  const [hostname, setHostname] = useState("");
  const [port, setPort] = useState<string>(String(defaultPort));
  const [username, setUsername] = useState("root");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("password");
  const [privateKeyPath, setPrivateKeyPath] = useState("");
  const [groupId, setGroupId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [secret, setSecret] = useState("");
  const [saveSecret, setSaveSecret] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSubmitError(null);
    setSecret("");
    if (editingHost) {
      setName(editingHost.name);
      setHostname(editingHost.hostname);
      setPort(String(editingHost.port));
      setUsername(editingHost.username);
      setAuthMethod(editingHost.authMethod);
      setPrivateKeyPath(editingHost.privateKeyPath ?? "");
      setGroupId(editingHost.groupId ?? "");
      setDescription(editingHost.description);
      setTagsInput(editingHost.tags.join(", "));
      setSaveSecret(Boolean(editingHost.credentialReference));
    } else {
      setName("");
      setHostname("");
      setPort(String(defaultPort || 22));
      setUsername("root");
      setAuthMethod("password");
      setPrivateKeyPath("");
      setGroupId("");
      setDescription("");
      setTagsInput("");
      setSaveSecret(false);
    }
  }, [open, editingHost, defaultPort]);

  if (!open) return null;

  const handleBrowseKey = async () => {
    try {
      const selected = await ipc.pickPrivateKeyFile();
      if (selected) {
        setPrivateKeyPath(selected);
      }
    } catch {
      // ignore if user cancels dialog
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSubmitError(null);

    const parsedPort = Number(port);
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const candidate: HostInput = {
      name,
      hostname,
      port: parsedPort,
      username,
      authMethod,
      privateKeyPath: authMethod === "private_key" ? privateKeyPath : null,
      groupId: groupId || null,
      description,
      tags,
      secret: secret ? secret : null,
      saveSecret,
    };

    const validation = hostInputSchema.safeParse(candidate);
    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of validation.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!fieldErrors[key]) {
          fieldErrors[key] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingHost) {
        await updateHost(editingHost.id, validation.data);
      } else {
        await createHost(validation.data);
      }
      setSecret("");
      onClose();
    } catch (err) {
      setSubmitError(formatError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="host-dialog-title"
    >
      <div className="w-full max-w-lg bg-surface border border-border rounded-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-sidebar">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-accent" />
            <h2
              id="host-dialog-title"
              className="text-sm font-semibold text-primaryText"
            >
              {editingHost ? "Edit SSH Host" : "New SSH Host"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-secondaryText hover:text-primaryText p-1 rounded"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
          {submitError && (
            <div className="p-3 rounded bg-error/15 border border-error/40 text-xs text-error">
              {submitError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label
                htmlFor="host-name"
                className="block text-xs font-medium text-secondaryText mb-1"
              >
                Display Name *
              </label>
              <input
                id="host-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Production API"
                className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:border-accent text-primaryText"
              />
              {errors.name && (
                <p className="text-[11px] text-error mt-1">{errors.name}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="host-group"
                className="block text-xs font-medium text-secondaryText mb-1"
              >
                Group
              </label>
              <select
                id="host-group"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="w-full px-2.5 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:border-accent text-primaryText"
              >
                <option value="">Ungrouped</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-3">
              <label
                htmlFor="host-hostname"
                className="block text-xs font-medium text-secondaryText mb-1"
              >
                Hostname or IP Address *
              </label>
              <input
                id="host-hostname"
                type="text"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="10.0.1.25 or ssh.example.com"
                className="w-full px-3 py-1.5 text-sm font-mono bg-background border border-border rounded focus:outline-none focus:border-accent text-primaryText"
              />
              {errors.hostname && (
                <p className="text-[11px] text-error mt-1">{errors.hostname}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="host-port"
                className="block text-xs font-medium text-secondaryText mb-1"
              >
                Port *
              </label>
              <input
                id="host-port"
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                className="w-full px-3 py-1.5 text-sm font-mono bg-background border border-border rounded focus:outline-none focus:border-accent text-primaryText"
              />
              {errors.port && (
                <p className="text-[11px] text-error mt-1">{errors.port}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="host-username"
                className="block text-xs font-medium text-secondaryText mb-1"
              >
                Username *
              </label>
              <input
                id="host-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ubuntu"
                className="w-full px-3 py-1.5 text-sm font-mono bg-background border border-border rounded focus:outline-none focus:border-accent text-primaryText"
              />
              {errors.username && (
                <p className="text-[11px] text-error mt-1">{errors.username}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-secondaryText mb-1">
                Authentication Method *
              </label>
              <div className="grid grid-cols-2 gap-1.5 p-0.5 bg-background border border-border rounded">
                <button
                  type="button"
                  onClick={() => setAuthMethod("password")}
                  className={`flex items-center justify-center gap-1.5 py-1 text-xs rounded font-medium transition-colors ${
                    authMethod === "password"
                      ? "bg-elevated text-accent"
                      : "text-secondaryText hover:text-primaryText"
                  }`}
                >
                  <Lock className="w-3.5 h-3.5" />
                  Password
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMethod("private_key")}
                  className={`flex items-center justify-center gap-1.5 py-1 text-xs rounded font-medium transition-colors ${
                    authMethod === "private_key"
                      ? "bg-elevated text-accent"
                      : "text-secondaryText hover:text-primaryText"
                  }`}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  Private Key
                </button>
              </div>
            </div>
          </div>

          {authMethod === "private_key" && (
            <div>
              <label
                htmlFor="host-key-path"
                className="block text-xs font-medium text-secondaryText mb-1"
              >
                Private Key File Path *
              </label>
              <div className="flex gap-2">
                <input
                  id="host-key-path"
                  type="text"
                  value={privateKeyPath}
                  onChange={(e) => setPrivateKeyPath(e.target.value)}
                  placeholder="~/.ssh/id_ed25519"
                  className="flex-1 px-3 py-1.5 text-sm font-mono bg-background border border-border rounded focus:outline-none focus:border-accent text-primaryText"
                />
                <button
                  type="button"
                  onClick={() => void handleBrowseKey()}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-elevated hover:bg-border text-primaryText rounded border border-border"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  Browse
                </button>
              </div>
              {errors.privateKeyPath && (
                <p className="text-[11px] text-error mt-1">
                  {errors.privateKeyPath}
                </p>
              )}
            </div>
          )}

          {/* Optional OS Keychain Secret Storage */}
          <div className="p-3 rounded bg-background/70 border border-border space-y-2.5">
            <div>
              <label
                htmlFor="host-secret"
                className="block text-xs font-medium text-secondaryText mb-1"
              >
                {authMethod === "password"
                  ? "SSH Password (Optional — leave blank to prompt on connect)"
                  : "Private Key Passphrase (Optional — for encrypted keys)"}
              </label>
              <input
                id="host-secret"
                type="password"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={
                  editingHost?.credentialReference
                    ? "•••••••• (Stored in OS Keychain — enter to replace)"
                    : "Enter secret..."
                }
                className="w-full px-3 py-1.5 text-sm bg-surface border border-border rounded focus:outline-none focus:border-accent text-primaryText"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-secondaryText cursor-pointer select-none">
              <input
                type="checkbox"
                checked={saveSecret}
                onChange={(e) => setSaveSecret(e.target.checked)}
                className="rounded border-border text-accent focus:ring-0"
              />
              <span>
                Save credential securely in OS Credential Manager (never stored
                in SQLite)
              </span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="host-tags"
                className="block text-xs font-medium text-secondaryText mb-1"
              >
                Tags (comma-separated)
              </label>
              <input
                id="host-tags"
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="prod, db, eu-west"
                className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:border-accent text-primaryText"
              />
            </div>

            <div>
              <label
                htmlFor="host-description"
                className="block text-xs font-medium text-secondaryText mb-1"
              >
                Description
              </label>
              <input
                id="host-description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Primary cluster node"
                className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded focus:outline-none focus:border-accent text-primaryText"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-secondaryText hover:text-primaryText rounded border border-transparent hover:border-border"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 text-xs font-mono font-semibold bg-accent text-slate-950 hover:bg-emerald-400 rounded-xs transition-colors disabled:opacity-50"
            >
              {isSubmitting
                ? "Saving..."
                : editingHost
                  ? "Save Changes"
                  : "Create Host"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

