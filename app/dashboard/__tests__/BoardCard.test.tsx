/**
 * Unit tests for the BoardCard dashboard component.
 *
 * Covers:
 *   1. Renders board title and formatted date.
 *   2. Delete button opens the confirmation dialog.
 *   3. Cancel button closes the dialog without calling deleteBoard.
 *   4. Confirm button calls deleteBoard with the correct boardId.
 *   5. Title containing special characters renders safely (no XSS).
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { BoardCard } from "../BoardCard";

// ---------------------------------------------------------------------------
// Mock next/navigation (BoardCard uses useRouter for refresh after delete)
// ---------------------------------------------------------------------------

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// ---------------------------------------------------------------------------
// Mock deleteBoard server action
// ---------------------------------------------------------------------------

vi.mock("../actions", () => ({
  deleteBoard: vi.fn().mockResolvedValue(undefined),
  createBoard: vi.fn().mockResolvedValue(undefined),
}));

import { deleteBoard } from "../actions";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

const DEFAULT_PROPS = {
  id: "board-uuid-001",
  title: "Sprint Planning",
  createdAt: "2025-06-15T10:00:00.000Z",
};

function renderCard(props = DEFAULT_PROPS) {
  return render(<BoardCard {...props} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BoardCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the board title in the card link", () => {
    renderCard();
    // The title appears in both the card link AND the confirmation dialog <strong>.
    // Query by the span element to target the card specifically.
    const titleSpan = document.querySelector("[class*='cardTitle']");
    expect(titleSpan).toHaveTextContent("Sprint Planning");
  });

  it("renders a formatted creation date", () => {
    renderCard();
    expect(screen.getByText(/Jun 15, 2025/i)).toBeInTheDocument();
  });

  it("clicking the delete button opens the confirmation dialog", () => {
    renderCard();
    const deleteBtn = screen.getByRole("button", { name: /delete board/i });
    const dialog = document.querySelector("dialog")!;

    expect(dialog.open).toBe(false);
    fireEvent.click(deleteBtn);
    expect(dialog.open).toBe(true);
  });

  it("Cancel closes the dialog without calling deleteBoard", () => {
    renderCard();
    // Open the dialog
    fireEvent.click(screen.getByRole("button", { name: /delete board/i }));
    const dialog = document.querySelector("dialog")!;
    expect(dialog.open).toBe(true);

    // The Cancel button lives inside the now-open dialog
    const cancelBtn = within(dialog).getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelBtn);

    expect(dialog.open).toBe(false);
    expect(deleteBoard).not.toHaveBeenCalled();
  });

  it("Confirm calls deleteBoard with the board id", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /delete board/i }));
    const dialog = document.querySelector("dialog")!;

    const confirmBtn = within(dialog).getByRole("button", { name: /^delete$/i });
    fireEvent.click(confirmBtn);

    expect(deleteBoard).toHaveBeenCalledWith("board-uuid-001");
  });

  it("renders title with special characters safely (no raw HTML injection)", () => {
    renderCard({ ...DEFAULT_PROPS, title: '<script>alert("xss")</script>' });
    // The raw <script> tag must not be injected as a real DOM element
    expect(document.querySelector("script")).toBeNull();
    // The text is safely escaped — at least one element shows the escaped text
    const titleSpan = document.querySelector("[class*='cardTitle']");
    expect(titleSpan?.textContent).toBe('<script>alert("xss")</script>');
  });
});
