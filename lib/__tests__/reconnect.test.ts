/**
 * Tests for SupabaseYjsProvider reconnect behaviour.
 *
 * These tests verify the gap identified in the multi-board migration audit:
 *   1. After a CHANNEL_ERROR the status correctly shows "disconnected".
 *   2. When the browser fires the "online" event, the provider tears down the
 *      stale channel and opens a fresh Realtime subscription (was a live bug —
 *      the old code only emitted "connected" without actually reconnecting).
 *   3. Once the new channel subscribes successfully, status returns to "connected".
 *   4. destroy() resolves only after the final saveToDb() completes (no data loss
 *      on tab close from a fire-and-forget save).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as Y from "yjs";
import { SupabaseYjsProvider } from "../supabase-yjs-provider";
import type { ConnectionStatus } from "../supabase-yjs-provider";

// ---------------------------------------------------------------------------
// Minimal Supabase mock (same pattern as connection-status.test.ts)
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

  const triggerChannelStatus = (status: string) => {
    channelSubscribeHandler?.(status);
  };

  return { mockSupabase, mockChannel, triggerChannelStatus };
}

// ---------------------------------------------------------------------------
// Window event capture helper (same as connection-status.test.ts)
// ---------------------------------------------------------------------------

function createWindowEventCapture() {
  const listeners: Record<string, EventListenerOrEventListenerObject[]> = {};

  const originalAdd = window.addEventListener.bind(window);
  const originalRemove = window.removeEventListener.bind(window);

  vi.spyOn(window, "addEventListener").mockImplementation((type, listener, opts) => {
    if (!listeners[type]) listeners[type] = [];
    listeners[type].push(listener);
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

  const restore = () => { vi.restoreAllMocks(); };
  return { fire, restore };
}

async function buildProvider(
  mockSupabase: ReturnType<typeof createMockSupabase>["mockSupabase"]
): Promise<SupabaseYjsProvider> {
  const doc = new Y.Doc();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provider = new SupabaseYjsProvider(doc, mockSupabase as any, {
    roomId: "test-room",
    saveInterval: 0,
  });
  await new Promise((r) => setTimeout(r, 20));
  return provider;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SupabaseYjsProvider — reconnect logic", () => {
  let windowCapture: ReturnType<typeof createWindowEventCapture>;

  beforeEach(() => {
    windowCapture = createWindowEventCapture();
  });

  afterEach(() => {
    windowCapture.restore();
  });

  it("window 'online' creates a new Realtime channel subscription", async () => {
    const { mockSupabase, triggerChannelStatus } = createMockSupabase();
    const provider = await buildProvider(mockSupabase);

    // Simulate a channel error first
    triggerChannelStatus("CHANNEL_ERROR");

    const channelCallsBefore = mockSupabase.channel.mock.calls.length;

    // Going online should tear down the broken channel and re-subscribe
    windowCapture.fire("online");

    expect(mockSupabase.channel).toHaveBeenCalledTimes(channelCallsBefore + 1);

    await provider.destroy();
  });

  it("after going online, status becomes 'connected' when the new channel subscribes", async () => {
    const { mockSupabase, triggerChannelStatus } = createMockSupabase();
    const provider = await buildProvider(mockSupabase);

    const statuses: ConnectionStatus[] = [];
    provider.setStatusCallback((s) => statuses.push(s));
    statuses.length = 0; // clear replay

    triggerChannelStatus("CHANNEL_ERROR");
    expect(statuses.at(-1)).toBe("disconnected");

    // Going online triggers re-subscribe; triggerChannelStatus now drives the
    // new channel's handler (same mock channel, same subscribe stub)
    windowCapture.fire("online");
    triggerChannelStatus("SUBSCRIBED");

    expect(statuses.at(-1)).toBe("connected");

    await provider.destroy();
  });

  it("destroy() resolves only after saveToDb completes", async () => {
    let savedCalled = false;
    let resolveUpsert!: () => void;

    const { mockSupabase } = createMockSupabase();

    // Make the upsert return a promise we control
    const pendingUpsert = new Promise<{ error: null }>((resolve) => {
      resolveUpsert = () => resolve({ error: null });
    });
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      upsert: vi.fn().mockImplementation(() => {
        savedCalled = true;
        return pendingUpsert;
      }),
    });

    const provider = await buildProvider(mockSupabase);

    const destroyPromise = provider.destroy();

    // Destroy should not have resolved yet — it's awaiting the save
    let destroySettled = false;
    destroyPromise.then(() => { destroySettled = true; });

    // Flush microtasks (but don't resolve the upsert yet)
    await new Promise((r) => setTimeout(r, 10));
    expect(savedCalled).toBe(true);
    expect(destroySettled).toBe(false);

    // Now resolve the upsert → destroy() should finish
    resolveUpsert();
    await destroyPromise;
    expect(destroySettled).toBe(true);
  });
});
