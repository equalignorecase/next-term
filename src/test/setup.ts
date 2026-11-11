import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock ResizeObserver for jsdom
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

globalThis.ResizeObserver =
  MockResizeObserver as unknown as typeof ResizeObserver;

// Mock xterm.js canvas & addon methods in jsdom so Terminal lifecycle tests run cleanly
vi.mock("@xterm/xterm", () => {
  return {
    Terminal: vi.fn().mockImplementation((opts) => ({
      options: { ...opts },
      cols: 100,
      rows: 30,
      loadAddon: vi.fn(),
      open: vi.fn(),
      write: vi.fn(),
      focus: vi.fn(),
      dispose: vi.fn(),
      clear: vi.fn(),
      selectAll: vi.fn(),
      clearSelection: vi.fn(),
      paste: vi.fn(),
      hasSelection: vi.fn(() => false),
      getSelection: vi.fn(() => ""),
      onData: vi.fn(() => ({ dispose: vi.fn() })),
      onBinary: vi.fn(() => ({ dispose: vi.fn() })),
      onSelectionChange: vi.fn(() => ({ dispose: vi.fn() })),
      attachCustomKeyEventHandler: vi.fn(),
    })),
  };
});

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: vi.fn(),
    dispose: vi.fn(),
  })),
}));

vi.mock("@xterm/addon-search", () => ({
  SearchAddon: vi.fn().mockImplementation(() => ({
    findNext: vi.fn(),
    dispose: vi.fn(),
  })),
}));

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: vi.fn().mockImplementation(() => ({
    dispose: vi.fn(),
  })),
}));

