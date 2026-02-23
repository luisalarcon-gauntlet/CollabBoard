/**
 * Integration tests for adding shapes (sticky notes, rectangles, circles, etc.)
 * to the Whiteboard. Verifies that toolbar buttons correctly add objects to
 * the shared Yjs store and that they render on the canvas.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Whiteboard } from "../Whiteboard";
import { destroyProvider, getSharedLayers } from "@/lib/yjs-store";

// ---------------------------------------------------------------------------
// Mock Supabase (required by yjs-store -> SupabaseYjsProvider)
// ---------------------------------------------------------------------------

function createMockSupabase() {
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
    send: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
  };

  const mockSupabase = {
    channel: vi.fn().mockReturnValue(mockChannel),
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
  };

  return mockSupabase;
}

vi.mock("@/lib/supabase", () => ({
  supabase: createMockSupabase(),
}));

// ---------------------------------------------------------------------------
// Mock Avatars and CursorPresence (avoid act() warnings from async awareness)
// ---------------------------------------------------------------------------

vi.mock("../Avatars", () => ({ Avatars: () => null }));
vi.mock("../CursorPresence", () => ({ CursorPresence: () => null }));

// ---------------------------------------------------------------------------
// Mock Clerk
// ---------------------------------------------------------------------------

vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    user: {
      id: "test-user",
      firstName: "Test",
      lastName: "User",
      imageUrl: null,
    },
  }),
}));

// ---------------------------------------------------------------------------
// Test board ID
// ---------------------------------------------------------------------------

const TEST_BOARD_ID = "test-board-add-shapes";

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(async () => {
  await destroyProvider(TEST_BOARD_ID);
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Whiteboard — add shapes", () => {
  beforeEach(async () => {
    await destroyProvider(TEST_BOARD_ID);
  });

  it("adds a sticky note when clicking the Sticky toolbar button", async () => {
    render(<Whiteboard boardId={TEST_BOARD_ID} />);

    // Wait for client mount (WhiteboardClient shows "Loading board…" until mounted)
    await waitFor(() => {
      expect(screen.queryByText("Loading board…")).not.toBeInTheDocument();
    });

    // Click Add Sticky Note button (accessible name is "Sticky" from button label)
    const stickyButton = screen.getByRole("button", { name: "Sticky" });
    fireEvent.click(stickyButton);

    // Sticky is created with text "New note" — should appear on canvas
    await waitFor(() => {
      expect(screen.getByText("New note")).toBeInTheDocument();
    });
  });

  it("adds a rectangle when clicking the Rectangle toolbar button", async () => {
    render(<Whiteboard boardId={TEST_BOARD_ID} />);

    await waitFor(() => {
      expect(screen.queryByText("Loading board…")).not.toBeInTheDocument();
    });

    const layersBefore = getSharedLayers(TEST_BOARD_ID);
    const countBefore = layersBefore?.size ?? 0;

    const rectButton = screen.getByRole("button", { name: "Rectangle" });
    fireEvent.click(rectButton);

    await waitFor(() => {
      const layers = getSharedLayers(TEST_BOARD_ID);
      expect(layers?.size ?? 0).toBe(countBefore + 1);
      const entries = Array.from(layers?.entries() ?? []);
      const rect = entries.find(([, l]) => l?.type === "rectangle");
      expect(rect).toBeDefined();
    });
  });

  it("adds a circle when clicking the Circle toolbar button", async () => {
    render(<Whiteboard boardId={TEST_BOARD_ID} />);

    await waitFor(() => {
      expect(screen.queryByText("Loading board…")).not.toBeInTheDocument();
    });

    const layersBefore = getSharedLayers(TEST_BOARD_ID);
    const countBefore = layersBefore?.size ?? 0;

    const circleButton = screen.getByRole("button", { name: "Circle" });
    fireEvent.click(circleButton);

    await waitFor(() => {
      const layers = getSharedLayers(TEST_BOARD_ID);
      expect(layers?.size ?? 0).toBe(countBefore + 1);
      const entries = Array.from(layers?.entries() ?? []);
      const circle = entries.find(([, l]) => l?.type === "circle");
      expect(circle).toBeDefined();
    });
  });

  it("adds a text element when clicking the Text toolbar button", async () => {
    render(<Whiteboard boardId={TEST_BOARD_ID} />);

    await waitFor(() => {
      expect(screen.queryByText("Loading board…")).not.toBeInTheDocument();
    });

    const layersBefore = getSharedLayers(TEST_BOARD_ID);
    const countBefore = layersBefore?.size ?? 0;

    const textButton = screen.getByRole("button", { name: "Text" });
    fireEvent.click(textButton);

    await waitFor(() => {
      const layers = getSharedLayers(TEST_BOARD_ID);
      expect(layers?.size ?? 0).toBe(countBefore + 1);
      const entries = Array.from(layers?.entries() ?? []);
      const textEl = entries.find(([, l]) => l?.type === "text");
      expect(textEl).toBeDefined();
    });
  });
});
