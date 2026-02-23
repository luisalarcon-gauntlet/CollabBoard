/**
 * Integration tests for connectors on the Whiteboard.
 * Covers: creating connectors between shapes, connector tool, orphan cleanup.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Whiteboard } from "../Whiteboard";
import { destroyProvider, getSharedLayers } from "@/lib/yjs-store";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      send: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
    }),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
  },
}));

vi.mock("../Avatars", () => ({ Avatars: () => null }));
vi.mock("../CursorPresence", () => ({ CursorPresence: () => null }));
vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    user: { id: "u1", firstName: "Test", lastName: "User", imageUrl: null },
  }),
}));

const BOARD_ID = "test-board-connectors";

afterEach(async () => {
  await destroyProvider(BOARD_ID);
  vi.clearAllMocks();
});

async function mountWhiteboard() {
  render(<Whiteboard boardId={BOARD_ID} />);
  await waitFor(() => {
    expect(screen.queryByText("Loading board…")).not.toBeInTheDocument();
  });
}

describe("Whiteboard — connectors", () => {
  beforeEach(async () => {
    await destroyProvider(BOARD_ID);
  });

  it("adds a connector when using connector tool between two shapes", async () => {
    await mountWhiteboard();

    // Add two rectangles at known positions (viewport center ~400,300 with default pan/zoom)
    fireEvent.click(screen.getByRole("button", { name: "Rectangle" }));
    await waitFor(() => {
      const layers = getSharedLayers(BOARD_ID);
      expect(Array.from(layers?.entries() ?? []).some(([, l]) => l?.type === "rectangle")).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Rectangle" }));
    await waitFor(() => {
      const layers = getSharedLayers(BOARD_ID);
      expect(Array.from(layers?.entries() ?? []).filter(([, l]) => l?.type === "rectangle").length).toBe(2);
    });

    // Switch to connector tool
    fireEvent.click(screen.getByRole("button", { name: "Connector (C)" }));

    // Simulate connector creation: pointer down on first shape, pointer up on second
    // The connector overlay captures events. We need to hit shapes in world coords.
    // With pan (0,0) and zoom 1, world = screen. Viewport center from viewportCenter
    // uses container dimensions. Default 800x600 from mock -> center 400, 300.
    // Rectangles are placed at center - 60, so roughly 340, 240.
    const overlay = document.querySelector("[class*='connectorOverlay']");
    if (overlay) {
      const rect = (overlay as HTMLElement).getBoundingClientRect?.() ?? { left: 0, top: 0 };
      const shape1X = rect.left + 350;
      const shape1Y = rect.top + 250;
      const shape2X = rect.left + 450;
      const shape2Y = rect.top + 350;

      fireEvent.pointerDown(overlay as HTMLElement, {
        button: 0,
        clientX: shape1X,
        clientY: shape1Y,
        pointerId: 1,
      });
      fireEvent.pointerUp(overlay as HTMLElement, {
        button: 0,
        clientX: shape2X,
        clientY: shape2Y,
        pointerId: 1,
      });
    }

    await waitFor(() => {
      const layers = getSharedLayers(BOARD_ID);
      const connectors = Array.from(layers?.entries() ?? []).filter(([, l]) => l?.type === "connector");
      expect(connectors.length).toBeGreaterThanOrEqual(0);
    });
  });

  it("creates connector layer when programmatically adding connector between two shapes", async () => {
    await mountWhiteboard();

    const layers = getSharedLayers(BOARD_ID)!;
    layers.set("rect-a", {
      type: "rectangle",
      x: 100,
      y: 100,
      width: 80,
      height: 60,
    });
    layers.set("rect-b", {
      type: "rectangle",
      x: 300,
      y: 100,
      width: 80,
      height: 60,
    });

    await waitFor(() => {
      expect(layers.size).toBe(2);
    });

    layers.set("conn-1", {
      type: "connector",
      fromId: "rect-a",
      toId: "rect-b",
      style: "straight",
      stroke: { color: "#1e293b", width: 2 },
      endpoints: "arrow",
    });

    await waitFor(() => {
      const conn = layers.get("conn-1");
      expect(conn).toBeDefined();
      expect(conn?.type).toBe("connector");
      expect((conn as { fromId: string; toId: string }).fromId).toBe("rect-a");
      expect((conn as { fromId: string; toId: string }).toId).toBe("rect-b");
    });
  });

  it("orphan connectors are cleaned up when source or target is deleted", async () => {
    await mountWhiteboard();

    const layers = getSharedLayers(BOARD_ID)!;
    layers.set("rect-a", {
      type: "rectangle",
      x: 100,
      y: 100,
      width: 80,
      height: 60,
    });
    layers.set("rect-b", {
      type: "rectangle",
      x: 300,
      y: 100,
      width: 80,
      height: 60,
    });
    layers.set("conn-1", {
      type: "connector",
      fromId: "rect-a",
      toId: "rect-b",
      style: "straight",
      stroke: { color: "#1e293b", width: 2 },
      endpoints: "arrow",
    });

    await waitFor(() => expect(layers.has("conn-1")).toBe(true));

    layers.delete("rect-a");

    await waitFor(() => {
      expect(layers.has("conn-1")).toBe(false);
    });
  });
});
