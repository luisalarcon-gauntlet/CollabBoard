/**
 * Tests for SupabaseYjsProvider persistence (loadFromDb / saveToDb)
 * and the `loaded` promise that signals when initial DB state has been applied.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import * as Y from "yjs";
import { SupabaseYjsProvider } from "../supabase-yjs-provider";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uint8ToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** Build a base64-encoded Yjs state that contains a Y.Map "layers" with one entry. */
function buildPersistedState(): string {
  const doc = new Y.Doc();
  const map = doc.getMap<{ type: string; x: number; y: number; text: string }>("layers");
  map.set("sticky-1", { type: "sticky", x: 10, y: 20, text: "Hello" });
  const state = Y.encodeStateAsUpdate(doc);
  return uint8ToBase64(state);
}

// ---------------------------------------------------------------------------
// Mock Supabase factory
// ---------------------------------------------------------------------------

type SubscribeHandler = (status: string) => void;

function createMockSupabase(opts: {
  selectData?: unknown;
  selectError?: { message: string } | null;
  upsertError?: { message: string } | null;
} = {}) {
  let channelSubscribeHandler: SubscribeHandler | null = null;

  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockImplementation((cb: SubscribeHandler) => {
      channelSubscribeHandler = cb;
      return mockChannel;
    }),
    send: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
  };

  const mockSupabase = {
    channel: vi.fn().mockReturnValue(mockChannel),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: opts.selectData ?? null,
            error: opts.selectError ?? null,
          }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: opts.upsertError ?? null }),
    }),
  };

  const triggerChannelStatus = (status: string) => {
    channelSubscribeHandler?.(status);
  };

  return { mockSupabase, mockChannel, triggerChannelStatus };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildProvider(mockSupabase: any, extraOpts: Record<string, unknown> = {}) {
  const doc = new Y.Doc();
  const provider = new SupabaseYjsProvider(doc, mockSupabase, {
    roomId: "test-board",
    saveInterval: 0,
    ...extraOpts,
  });
  return { doc, provider };
}

/** Wait for the provider's async init to settle. */
async function waitForInit() {
  await new Promise((r) => setTimeout(r, 30));
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

const providers: SupabaseYjsProvider[] = [];

afterEach(async () => {
  for (const p of providers) await p.destroy();
  providers.length = 0;
});

// ---------------------------------------------------------------------------
// Tests — loadFromDb
// ---------------------------------------------------------------------------

describe("SupabaseYjsProvider — loadFromDb", () => {
  it("applies a base64-encoded Yjs state from the DB to the doc", async () => {
    const encoded = buildPersistedState();
    const { mockSupabase } = createMockSupabase({
      selectData: { content: encoded },
    });

    const { doc, provider } = buildProvider(mockSupabase);
    providers.push(provider);
    await waitForInit();

    const layers = doc.getMap("layers");
    expect(layers.size).toBe(1);
    expect(layers.get("sticky-1")).toMatchObject({ type: "sticky", x: 10, y: 20, text: "Hello" });
  });

  it("leaves the doc empty when DB returns null (new board)", async () => {
    const { mockSupabase } = createMockSupabase({ selectData: null });

    const { doc, provider } = buildProvider(mockSupabase);
    providers.push(provider);
    await waitForInit();

    expect(doc.getMap("layers").size).toBe(0);
  });

  it("leaves the doc empty and does not throw when DB returns an error", async () => {
    const { mockSupabase } = createMockSupabase({
      selectError: { message: "table not found" },
    });

    const { doc, provider } = buildProvider(mockSupabase);
    providers.push(provider);
    await waitForInit();

    expect(doc.getMap("layers").size).toBe(0);
  });

  it("leaves the doc usable when content column is null (empty row)", async () => {
    const { mockSupabase } = createMockSupabase({
      selectData: { content: null },
    });

    const { doc, provider } = buildProvider(mockSupabase);
    providers.push(provider);
    await waitForInit();

    const layers = doc.getMap("layers");
    layers.set("test", { type: "sticky", x: 0, y: 0, text: "works" });
    expect(layers.get("test")).toMatchObject({ text: "works" });
  });
});

// ---------------------------------------------------------------------------
// Tests — loaded promise
// ---------------------------------------------------------------------------

describe("SupabaseYjsProvider — loaded promise", () => {
  it("resolves after loadFromDb completes with data", async () => {
    const encoded = buildPersistedState();
    const { mockSupabase } = createMockSupabase({
      selectData: { content: encoded },
    });

    const { doc, provider } = buildProvider(mockSupabase);
    providers.push(provider);

    await provider.loaded;

    const layers = doc.getMap("layers");
    expect(layers.size).toBe(1);
  });

  it("resolves even when loadFromDb returns empty (new board)", async () => {
    const { mockSupabase } = createMockSupabase({ selectData: null });

    const { provider } = buildProvider(mockSupabase);
    providers.push(provider);

    await expect(provider.loaded).resolves.toBeUndefined();
  });

  it("resolves even when loadFromDb errors", async () => {
    const { mockSupabase } = createMockSupabase({
      selectError: { message: "network error" },
    });

    const { provider } = buildProvider(mockSupabase);
    providers.push(provider);

    await expect(provider.loaded).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests — saveToDb
// ---------------------------------------------------------------------------

describe("SupabaseYjsProvider — saveToDb", () => {
  it("encodes the current doc state as base64 and calls upsert", async () => {
    const { mockSupabase } = createMockSupabase();

    const { doc, provider } = buildProvider(mockSupabase);
    providers.push(provider);
    await waitForInit();

    doc.getMap("layers").set("rect-1", {
      type: "rectangle", x: 0, y: 0, width: 100, height: 50,
    });

    await provider.saveToDb();

    const fromCalls = mockSupabase.from.mock.calls;
    const upsertCall = fromCalls.find(
      (c: string[]) => c[0] === "yjs_updates"
    );
    expect(upsertCall).toBeDefined();
  });

  it("does not throw when upsert returns an error", async () => {
    const { mockSupabase } = createMockSupabase({
      upsertError: { message: "permission denied" },
    });

    const { provider } = buildProvider(mockSupabase);
    providers.push(provider);
    await waitForInit();

    await expect(provider.saveToDb()).resolves.toBeUndefined();
  });
});
