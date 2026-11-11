import { z } from "zod";

const hostnameRegex =
  /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9-]*[A-Za-z0-9])$/;
const ipv4Regex =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function isValidHostnameOrIp(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 253) return false;
  if (ipv4Regex.test(trimmed)) return true;
  if (trimmed.includes(":")) return true; // IPv6 basic allowance (backend validates IpAddr strictly)
  return hostnameRegex.test(trimmed);
}

export const hostInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Display name is required")
      .max(128, "Display name must not exceed 128 characters"),
    hostname: z
      .string()
      .trim()
      .min(1, "Hostname or IP address is required")
      .refine(isValidHostnameOrIp, "Invalid hostname or IP address format"),
    port: z
      .number({ invalid_type_error: "Port must be a number" })
      .int("Port must be an integer")
      .min(1, "Port must be between 1 and 65535")
      .max(65535, "Port must be between 1 and 65535"),
    username: z
      .string()
      .trim()
      .min(1, "Username is required")
      .max(128, "Username must not exceed 128 characters")
      .refine((v) => !/\s/.test(v), "Username cannot contain spaces"),
    authMethod: z.enum(["password", "private_key"]),
    privateKeyPath: z.string().optional().nullable(),
    groupId: z.string().optional().nullable(),
    description: z
      .string()
      .max(1000, "Description must not exceed 1000 characters")
      .optional(),
    tags: z
      .array(z.string().trim().min(1).max(32))
      .max(20, "Maximum of 20 tags allowed")
      .optional(),
    secret: z.string().optional().nullable(),
    saveSecret: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (
      data.authMethod === "private_key" &&
      (!data.privateKeyPath || data.privateKeyPath.trim().length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["privateKeyPath"],
        message: "Private key file path is required for key authentication",
      });
    }
  });

const hexColorRegex = /^#[0-9a-fA-F]{6}$/;

export const appSettingsSchema = z.object({
  theme: z.enum([
    "obsidian",
    "dark",
    "tokyo-night",
    "catppuccin",
    "dracula",
    "nord",
    "gruvbox",
    "light",
    "solarized-light",
  ]),
  accentColor: z
    .string()
    .trim()
    .regex(hexColorRegex, "Accent color must be a valid 6-digit hex (#RRGGBB)"),
  terminalFontFamily: z.string().trim().min(1).max(256),
  terminalFontSize: z.number().int().min(8).max(36),
  terminalLineHeight: z.number().min(1.0).max(2.5),
  terminalPadding: z.number().int().min(0).max(32),
  cursorStyle: z.enum(["block", "underline", "bar"]),
  cursorBlink: z.boolean(),
  scrollback: z.number().int().min(100).max(100000),
  copyOnSelect: z.boolean(),
  rightClickBehavior: z.enum(["context_menu", "paste"]),
  enableBell: z.boolean(),
  connectionTimeoutSecs: z.number().int().min(3).max(300),
  keepaliveIntervalSecs: z.number().int().min(5).max(300),
  terminalType: z.enum(["xterm-256color", "xterm", "vt100"]),
  defaultSshPort: z.number().int().min(1).max(65535),
  telemetryEnabled: z.boolean(),
  telemetryIntervalSecs: z.number().int().min(1).max(30),
  uiDensity: z.enum(["compact", "comfortable"]),
  language: z.enum(["en", "th"]),
});

