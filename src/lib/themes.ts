import type { ITheme } from "@xterm/xterm";
import type { ThemePresetId } from "@/types/models";

export interface ThemePresetDefinition {
  id: ThemePresetId;
  name: string;
  isLight: boolean;
  defaultAccent: string;
  colors: {
    background: string; // Hex #RRGGBB
    sidebar: string;
    surface: string;
    elevated: string;
    border: string;
    primaryText: string;
    secondaryText: string;
  };
  ansi: {
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };
}

export const ACCENT_SWATCHES = [
  { name: "Emerald", hex: "#10B981" },
  { name: "Cyber Cyan", hex: "#38BDF8" },
  { name: "Tokyo Blue", hex: "#7AA2F7" },
  { name: "Catppuccin Mauve", hex: "#CBA6F7" },
  { name: "Dracula Pink", hex: "#FF79C6" },
  { name: "Gruvbox Amber", hex: "#F59E0B" },
  { name: "Rose Red", hex: "#F43F5E" },
];

export const THEME_PRESETS: Record<ThemePresetId, ThemePresetDefinition> = {
  obsidian: {
    id: "obsidian",
    name: "Obsidian Emerald",
    isLight: false,
    defaultAccent: "#10B981",
    colors: {
      background: "#090A0F",
      sidebar: "#0D0F17",
      surface: "#12151F",
      elevated: "#181C29",
      border: "#1E222D",
      primaryText: "#F1F5F9",
      secondaryText: "#7E8B9B",
    },
    ansi: {
      black: "#090A0F",
      red: "#EF4444",
      green: "#10B981",
      yellow: "#F59E0B",
      blue: "#38BDF8",
      magenta: "#C084FC",
      cyan: "#2DD4BF",
      white: "#F1F5F9",
      brightBlack: "#64748B",
      brightRed: "#F87171",
      brightGreen: "#34D399",
      brightYellow: "#FBBF24",
      brightBlue: "#7DD3FC",
      brightMagenta: "#D8B4FE",
      brightCyan: "#5EEAD4",
      brightWhite: "#FFFFFF",
    },
  },
  "tokyo-night": {
    id: "tokyo-night",
    name: "Tokyo Night",
    isLight: false,
    defaultAccent: "#7AA2F7",
    colors: {
      background: "#1A1B26",
      sidebar: "#16161E",
      surface: "#1F2335",
      elevated: "#292E42",
      border: "#2F3549",
      primaryText: "#C0CAF5",
      secondaryText: "#787C99",
    },
    ansi: {
      black: "#15161E",
      red: "#F7768E",
      green: "#9ECE6A",
      yellow: "#E0AF68",
      blue: "#7AA2F7",
      magenta: "#BB9AF7",
      cyan: "#7DCFFF",
      white: "#A9B1D6",
      brightBlack: "#414868",
      brightRed: "#F7768E",
      brightGreen: "#9ECE6A",
      brightYellow: "#E0AF68",
      brightBlue: "#7AA2F7",
      brightMagenta: "#BB9AF7",
      brightCyan: "#7DCFFF",
      brightWhite: "#C0CAF5",
    },
  },
  catppuccin: {
    id: "catppuccin",
    name: "Catppuccin Mocha",
    isLight: false,
    defaultAccent: "#CBA6F7",
    colors: {
      background: "#1E1E2E",
      sidebar: "#181825",
      surface: "#24273A",
      elevated: "#313244",
      border: "#363A4F",
      primaryText: "#CDD6F4",
      secondaryText: "#9399B2",
    },
    ansi: {
      black: "#45475A",
      red: "#F38BA8",
      green: "#A6E3A1",
      yellow: "#F9E2AF",
      blue: "#89B4FA",
      magenta: "#F5C2E7",
      cyan: "#94E2D5",
      white: "#BAC2DE",
      brightBlack: "#585B70",
      brightRed: "#F38BA8",
      brightGreen: "#A6E3A1",
      brightYellow: "#F9E2AF",
      brightBlue: "#89B4FA",
      brightMagenta: "#F5C2E7",
      brightCyan: "#94E2D5",
      brightWhite: "#A6ADC8",
    },
  },
  dracula: {
    id: "dracula",
    name: "Dracula",
    isLight: false,
    defaultAccent: "#BD93F9",
    colors: {
      background: "#282A36",
      sidebar: "#21222C",
      surface: "#2C2E3B",
      elevated: "#343746",
      border: "#44475A",
      primaryText: "#F8F8F2",
      secondaryText: "#8B93B8",
    },
    ansi: {
      black: "#21222C",
      red: "#FF5555",
      green: "#50FA7B",
      yellow: "#F1FA8C",
      blue: "#BD93F9",
      magenta: "#FF79C6",
      cyan: "#8BE9FD",
      white: "#F8F8F2",
      brightBlack: "#6272A4",
      brightRed: "#FF6E6E",
      brightGreen: "#69FF94",
      brightYellow: "#FFFFA5",
      brightBlue: "#D6ACFF",
      brightMagenta: "#FF92DF",
      brightCyan: "#A4FFFF",
      brightWhite: "#FFFFFF",
    },
  },
  nord: {
    id: "nord",
    name: "Nord Polar",
    isLight: false,
    defaultAccent: "#88C0D0",
    colors: {
      background: "#2E3440",
      sidebar: "#242933",
      surface: "#3B4252",
      elevated: "#434C5E",
      border: "#4C566A",
      primaryText: "#ECEFF4",
      secondaryText: "#9AA5B8",
    },
    ansi: {
      black: "#3B4252",
      red: "#BF616A",
      green: "#A3BE8C",
      yellow: "#EBCB8B",
      blue: "#81A1C1",
      magenta: "#B48EAD",
      cyan: "#88C0D0",
      white: "#E5E9F0",
      brightBlack: "#4C566A",
      brightRed: "#BF616A",
      brightGreen: "#A3BE8C",
      brightYellow: "#EBCB8B",
      brightBlue: "#81A1C1",
      brightMagenta: "#B48EAD",
      brightCyan: "#8FBCBB",
      brightWhite: "#ECEFF4",
    },
  },
  gruvbox: {
    id: "gruvbox",
    name: "Gruvbox Dark",
    isLight: false,
    defaultAccent: "#FABD2F",
    colors: {
      background: "#1D2021",
      sidebar: "#161819",
      surface: "#282828",
      elevated: "#32302F",
      border: "#3C3836",
      primaryText: "#EBDBB2",
      secondaryText: "#A89984",
    },
    ansi: {
      black: "#282828",
      red: "#CC241D",
      green: "#98971A",
      yellow: "#D79921",
      blue: "#458588",
      magenta: "#B16286",
      cyan: "#689D6A",
      white: "#A89984",
      brightBlack: "#928374",
      brightRed: "#FB4934",
      brightGreen: "#B8BB26",
      brightYellow: "#FABD2F",
      brightBlue: "#83A598",
      brightMagenta: "#D3869B",
      brightCyan: "#8EC07C",
      brightWhite: "#EBDBB2",
    },
  },
  light: {
    id: "light",
    name: "Clean Daylight",
    isLight: true,
    defaultAccent: "#059669",
    colors: {
      background: "#FFFFFF",
      sidebar: "#F1F5F9",
      surface: "#F8FAFC",
      elevated: "#E2E8F0",
      border: "#CBD5E1",
      primaryText: "#0F172A",
      secondaryText: "#64748B",
    },
    ansi: {
      black: "#0F172A",
      red: "#DC2626",
      green: "#059669",
      yellow: "#D97706",
      blue: "#0284C7",
      magenta: "#7C3AED",
      cyan: "#0D9488",
      white: "#F1F5F9",
      brightBlack: "#64748B",
      brightRed: "#EF4444",
      brightGreen: "#10B981",
      brightYellow: "#F59E0B",
      brightBlue: "#0EA5E9",
      brightMagenta: "#8B5CF6",
      brightCyan: "#14B8A6",
      brightWhite: "#FFFFFF",
    },
  },
  "solarized-light": {
    id: "solarized-light",
    name: "Solarized Light",
    isLight: true,
    defaultAccent: "#268BD2",
    colors: {
      background: "#FDF6E3",
      sidebar: "#EEE8D5",
      surface: "#F5EFDC",
      elevated: "#E5DFC8",
      border: "#D5CFB8",
      primaryText: "#073642",
      secondaryText: "#586E75",
    },
    ansi: {
      black: "#073642",
      red: "#DC322F",
      green: "#859900",
      yellow: "#B58900",
      blue: "#268BD2",
      magenta: "#D33682",
      cyan: "#2AA198",
      white: "#EEE8D5",
      brightBlack: "#586E75",
      brightRed: "#CB4B16",
      brightGreen: "#859900",
      brightYellow: "#B58900",
      brightBlue: "#268BD2",
      brightMagenta: "#6C71C4",
      brightCyan: "#2AA198",
      brightWhite: "#FDF6E3",
    },
  },
  dark: {
    // Alias for backward compatibility with existing saved "dark" settings
    id: "dark",
    name: "Obsidian Emerald",
    isLight: false,
    defaultAccent: "#10B981",
    colors: {
      background: "#090A0F",
      sidebar: "#0D0F17",
      surface: "#12151F",
      elevated: "#181C29",
      border: "#1E222D",
      primaryText: "#F1F5F9",
      secondaryText: "#7E8B9B",
    },
    ansi: {
      black: "#090A0F",
      red: "#EF4444",
      green: "#10B981",
      yellow: "#F59E0B",
      blue: "#38BDF8",
      magenta: "#C084FC",
      cyan: "#2DD4BF",
      white: "#F1F5F9",
      brightBlack: "#64748B",
      brightRed: "#F87171",
      brightGreen: "#34D399",
      brightYellow: "#FBBF24",
      brightBlue: "#7DD3FC",
      brightMagenta: "#D8B4FE",
      brightCyan: "#5EEAD4",
      brightWhite: "#FFFFFF",
    },
  },
};

export const VISIBLE_THEME_PRESET_IDS: ThemePresetId[] = [
  "obsidian",
  "tokyo-night",
  "catppuccin",
  "dracula",
  "nord",
  "gruvbox",
  "light",
  "solarized-light",
];

export function hexToRgbTriplet(hex: string): string {
  const clean = hex.replace("#", "").trim();
  if (clean.length !== 6) return "16 185 129";
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return "16 185 129";
  }
  return `${r} ${g} ${b}`;
}

export function resolveThemePreset(themeId: string): ThemePresetDefinition {
  return (
    THEME_PRESETS[themeId as ThemePresetId] ?? THEME_PRESETS.obsidian
  );
}

export function applyThemeToDocument(
  themeId: string,
  accentHex: string,
  terminalPadding = 8
): void {
  const preset = resolveThemePreset(themeId);
  const root = document.documentElement;

  if (preset.isLight) {
    root.classList.remove("dark");
    root.classList.add("light");
  } else {
    root.classList.remove("light");
    root.classList.add("dark");
  }

  const validAccent = /^#[0-9A-Fa-f]{6}$/.test(accentHex)
    ? accentHex
    : preset.defaultAccent;

  root.style.setProperty(
    "--color-background",
    hexToRgbTriplet(preset.colors.background)
  );
  root.style.setProperty(
    "--color-sidebar",
    hexToRgbTriplet(preset.colors.sidebar)
  );
  root.style.setProperty(
    "--color-surface",
    hexToRgbTriplet(preset.colors.surface)
  );
  root.style.setProperty(
    "--color-elevated",
    hexToRgbTriplet(preset.colors.elevated)
  );
  root.style.setProperty(
    "--color-border",
    hexToRgbTriplet(preset.colors.border)
  );
  root.style.setProperty(
    "--color-primary-text",
    hexToRgbTriplet(preset.colors.primaryText)
  );
  root.style.setProperty(
    "--color-secondary-text",
    hexToRgbTriplet(preset.colors.secondaryText)
  );
  root.style.setProperty("--color-accent", hexToRgbTriplet(validAccent));
  root.style.setProperty("--terminal-bg", preset.colors.background);
  root.style.setProperty("--terminal-padding", `${terminalPadding}px`);
}

export function buildTerminalTheme(
  themeId: string,
  accentHex: string
): ITheme {
  const preset = resolveThemePreset(themeId);
  const validAccent = /^#[0-9A-Fa-f]{6}$/.test(accentHex)
    ? accentHex
    : preset.defaultAccent;
  const rgb = hexToRgbTriplet(validAccent).split(" ").join(", ");

  return {
    background: preset.colors.background,
    foreground: preset.colors.primaryText,
    cursor: validAccent,
    cursorAccent: preset.colors.background,
    selectionBackground: `rgba(${rgb}, 0.28)`,
    ...preset.ansi,
  };
}

