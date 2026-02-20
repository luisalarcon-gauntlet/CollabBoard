/**
 * Tests for the SupabaseYjsProvider connection-status feature.
 *
 * Three test cases:
 *  1. Channel CHANNEL_ERROR  → callback receives "disconnected"
 *  2. window "offline" event → callback receives "disconnected";
 *     window "online" event  → callback receives "connected"
 *  3. Late-registered callback immediately receives last known status (replay)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as Y from "yjs";
import { SupabaseYjsProvider } from "../supabase-yjs-provider";
import type { ConnectionStatus } from "../supabase-yjs-provider";

// ---------------------------------------------------------------------------
// Minimal Supabase mock
// ---------------------------------------------------------------------------

type SubscribeHandler = (status: string) => void;

function createMockSupabase() {
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
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
  };

  /** Simulate the Supabase Realtime channel firing a subscription status event. */
  const triggerChannelStatus = (status: string) => {
    channelSubscribeHandler?.(status);
  };

  return { mockSupabase, triggerChannelStatus };
}

// ---------------------------------------------------------------------------
// Helper: capture window event listeners so tests can fire them directly
// ---------------------------------------------------------------------------

function createWindowEventCapture() {
  const listeners: Record<string, EventListenerOrEventListenerObject[]> = {};

  const originalAdd = window.addEventListener.bind(window);
  const originalRemove = window.removeEventListener.bind(window);

  vi.spyOn(window, "addEventListener").mockImplementation((type, listener, opts) => {
    if (!listeners[type]) listeners[type] = [];
    listeners[type].push(listener);
    // Still call the real add so other things keep working
    originalAdd(type as string, listener, opts);
  });

  vi.spyOn(window, "removeEventListener").mockImplementation((type, listener, opts) => {
    if (listeners[type]) {
      listeners[type] = listeners[type].filter((l) => l !== listener);
    }
    originalRemove(type as string, listener, opts);
  });

  const fire = (type: string) => {
    const evt = new Event(type);
    (listeners[type] ?? []).forEach((l) => {
      if (typeof l === "function") l(evt);
      else l.handleEvent(evt);
    });
  };

  const restore = () => {
    vi.restoreAllMocks();
  };

  return { fire, restore };
}

// ---------------------------------------------------------------------------
// Helper: build a provider and wait for async init to finish
// ---------------------------------------------------------------------------

async function buildProvider(
  mockSupabase: ReturnType<typeof createMockSupabase>["mockSupabase"]
): Promise<SupabaseYjsProvider> {
  const doc = new Y.Doc();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provider = new SupabaseYjsProvider(doc, mockSupabase as any, {
    roomId: "test-room",
    saveInterval: 0, // disable auto-save timers in tests
  });
  // Let loadFromDb (async) and setupChannel resolve
  await new Promise((r) => setTimeout(r, 20));
  return provider;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SupabaseYjsProvider – connection status", () => {
  let windowCapture: ReturnType<typeof createWindowEventCapture>;

  beforeEach(() => {
    windowCapture = createWindowEventCapture();
  });

  afterEach(() => {
    windowCapture.restore();
  });

  // ── Test 1 ────────────────────────────────────────────────────────────────
  it(
    "Test 1: channel CHANNEL_ERROR fires the callback with 'disconnected'",
    async () => {
      const { mockSupabase, triggerChannelStatus } = createMockSupabase();
      const provider = await buildProvider(mockSupabase);

      const statuses: ConnectionStatus[] = [];
      provider.setStatusCallback((s) => statuses.push(s));

      // Simulate Supabase Realtime reporting a channel error
      triggerChannelStatus("CHANNEL_ERROR");

      expect(statuses).toContain("disconnected");

      provider.destroy();
    }
  );

  // ── Test 2 ────────────────────────────────────────────────────────────────
  it(
    "Test 2: window 'offline' event fires 'disconnected'; window 'online' fires 'connected'",
    async () => {
      const { mockSupabase } = createMockSupabase();
      const provider = await buildProvider(mockSupabase);

      const statuses: ConnectionStatus[] = [];
      provider.setStatusCallback((s) => statuses.push(s));

      // Clear the replay call so we only track events from here on
      statuses.length = 0;

      // Simulate DevTools going offline
      windowCapture.fire("offline");
      expect(statuses.at(-1)).toBe("disconnected");

      // Simulate coming back online
      windowCapture.fire("online");
      expect(statuses.at(-1)).toBe("connected");

      provider.destroy();
    }
  );

  // ── Test 3 ────────────────────────────────────────────────────────────────
  it(
    "Test 3: callback registered after a disconnect immediately receives 'disconnected' (replay)",
    async () => {
      const { mockSupabase, triggerChannelStatus } = createMockSupabase();
      const provider = await buildProvider(mockSupabase);

      // The channel errors BEFORE any React callback is registered
      triggerChannelStatus("CHANNEL_ERROR");

      // Now React mounts and registers its callback late
      const statuses: ConnectionStatus[] = [];
      provider.setStatusCallback((s) => statuses.push(s));

      // The very first call should replay the last known status immediately
      expect(statuses[0]).toBe("disconnected");

      provider.destroy();
    }
  );
});
