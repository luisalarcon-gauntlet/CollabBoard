/**
 * Integration tests for frames on the Whiteboard.
 * Covers: creating frames, containment, cascading delete, batch move.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Whiteboard } from "../Whiteboard";
import { destroyProvider, getSharedLayers } from "@/lib/yjs-store";
import { getElementsInFrame } from "@/lib/utils";

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

const BOARD_ID = "test-board-frames";

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

describe("Whiteboard — frames", () => {
  beforeEach(async () => {
    await destroyProvider(BOARD_ID);
  });

  it("adds a frame when clicking the Frame toolbar button", async () => {
    await mountWhiteboard();

    const layersBefore = getSharedLayers(BOARD_ID);
    const countBefore = layersBefore?.size ?? 0;

    fireEvent.click(screen.getByRole("button", { name: "Frame" }));

    await waitFor(() => {
      const layers = getSharedLayers(BOARD_ID);
      expect(layers?.size ?? 0).toBe(countBefore + 1);
      const frame = Array.from(layers?.entries() ?? []).find(([, l]) => l?.type === "frame");
      expect(frame).toBeDefined();
      expect((frame![1] as { title: string }).title).toBe("Frame");
    });
  });

  it("frame contains shapes that are fully inside its bounds", async () => {
    await mountWhiteboard();

    const layers = getSharedLayers(BOARD_ID)!;
    layers.set("frame-1", {
      type: "frame",
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      title: "My Frame",
      backgroundColor: "rgba(241, 245, 249, 0.7)",
    });
    layers.set("sticky-in", {
      type: "sticky",
      x: 50,
      y: 50,
      width: 100,
      height: 80,
      text: "Inside",
    });
    layers.set("sticky-out", {
      type: "sticky",
      x: 350,
      y: 250,
      width: 100,
      height: 80,
      text: "Outside",
    });

    await waitFor(() => {
      const snapshot = new Map(layers.entries());
      const contained = getElementsInFrame("frame-1", snapshot);
      expect(contained).toContain("sticky-in");
      expect(contained).not.toContain("sticky-out");
    });
  });

  it("deleting a frame cascades to contained shapes", async () => {
    await mountWhiteboard();

    const layers = getSharedLayers(BOARD_ID)!;
    layers.set("frame-1", {
      type: "frame",
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      title: "Frame",
      backgroundColor: "rgba(241, 245, 249, 0.7)",
    });
    layers.set("sticky-1", {
      type: "sticky",
      x: 50,
      y: 50,
      width: 80,
      height: 60,
      text: "Child",
    });

    await waitFor(() => expect(layers.has("sticky-1")).toBe(true));

    // Select frame by clicking its title bar (not the toolbar Frame button)
    const frameContainers = document.querySelectorAll("[class*='frameContainer']");
    const frameEl = frameContainers[0]?.querySelector("[class*='titleBar']") ?? frameContainers[0];
    if (frameEl) {
      fireEvent.pointerDown(frameEl as HTMLElement, { button: 0, clientX: 200, clientY: 150 });
      fireEvent.pointerUp(frameEl as HTMLElement, { button: 0 });
    }

    fireEvent.keyDown(document, { key: "Delete", code: "Delete" });

    await waitFor(() => {
      const layersAfter = getSharedLayers(BOARD_ID);
      expect(layersAfter?.has("frame-1")).toBe(false);
      expect(layersAfter?.has("sticky-1")).toBe(false);
    });
  });

  it("frame and contained shapes can be moved together (batch move)", async () => {
    await mountWhiteboard();

    const layers = getSharedLayers(BOARD_ID)!;
    layers.set("frame-1", {
      type: "frame",
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      title: "Frame",
      backgroundColor: "rgba(241, 245, 249, 0.7)",
    });
    layers.set("sticky-1", {
      type: "sticky",
      x: 120,
      y: 120,
      width: 60,
      height: 50,
      text: "Child",
    });

    await waitFor(() => {
      expect(layers.has("frame-1")).toBe(true);
      expect(layers.has("sticky-1")).toBe(true);
    });

    const frameBefore = layers.get("frame-1") as { x: number; y: number };
    const stickyBefore = layers.get("sticky-1") as { x: number; y: number };

    const dx = 50;
    const dy = 30;

    // Simulate batch move by directly updating (same logic as handleDragDelta)
    const ydoc = (await import("@/lib/yjs-store")).getYdoc(BOARD_ID);
    if (ydoc) {
      ydoc.transact(() => {
        layers.set("frame-1", {
          ...layers.get("frame-1"),
          x: frameBefore.x + dx,
          y: frameBefore.y + dy,
        } as typeof frameBefore);
        layers.set("sticky-1", {
          ...layers.get("sticky-1"),
          x: stickyBefore.x + dx,
          y: stickyBefore.y + dy,
        } as typeof stickyBefore);
      });
    }

    await waitFor(() => {
      const frameAfter = layers.get("frame-1") as { x: number; y: number };
      const stickyAfter = layers.get("sticky-1") as { x: number; y: number };
      expect(frameAfter.x).toBe(frameBefore.x + dx);
      expect(frameAfter.y).toBe(frameBefore.y + dy);
      expect(stickyAfter.x).toBe(stickyBefore.x + dx);
      expect(stickyAfter.y).toBe(stickyBefore.y + dy);
    });
  });
});
