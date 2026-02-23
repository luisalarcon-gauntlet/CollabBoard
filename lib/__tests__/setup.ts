import "@testing-library/jest-dom";

// ---------------------------------------------------------------------------
// Console error detection (fail tests on unexpected console.error)
// ---------------------------------------------------------------------------

const originalConsoleError = console.error;
let consoleErrorCalls: string[] = [];

beforeEach(() => {
  consoleErrorCalls = [];
  console.error = (...args: unknown[]) => {
    const msg = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
    consoleErrorCalls.push(msg);
    originalConsoleError.apply(console, args);
  };
});

afterEach(() => {
  console.error = originalConsoleError;
  // Fail on unexpected console.error (allow known test/app patterns)
  const isAllowed = (m: string) =>
    m.includes("act(") ||
    m.includes("Warning:") ||
    m.includes("Not implemented:") ||
    m.startsWith("[") || // App error logging: [createBoard], [deleteBoard]
    m.includes("stderr |");
  const unexpected = consoleErrorCalls.filter((m) => !isAllowed(m));
  if (unexpected.length > 0) {
    throw new Error(`Unexpected console.error:\n${unexpected.join("\n")}`);
  }
});

// ---------------------------------------------------------------------------
// getBoundingClientRect mock for coordinate transforms in Whiteboard tests
// ---------------------------------------------------------------------------

const DEFAULT_VIEWPORT = { width: 800, height: 600, left: 0, top: 0 };

export function mockViewport(rect: Partial<DOMRect> = {}) {
  const r = { ...DEFAULT_VIEWPORT, ...rect };
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    width: r.width,
    height: r.height,
    left: r.left,
    top: r.top,
    right: r.left + (r.width ?? 0),
    bottom: r.top + (r.height ?? 0),
    x: r.left,
    y: r.top,
    toJSON: () => ({}),
  }));
}

beforeEach(() => {
  mockViewport();
});

// ---------------------------------------------------------------------------
// Pointer capture polyfill (jsdom does not implement these)
// ---------------------------------------------------------------------------

if (typeof Element !== "undefined" && !Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function () {};
  Element.prototype.releasePointerCapture = function () {};
}

// ---------------------------------------------------------------------------
// HTMLDialogElement polyfill
// ---------------------------------------------------------------------------

if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
    (this as HTMLDialogElement & { open: boolean }).open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    (this as HTMLDialogElement & { open: boolean }).open = false;
  };
}
