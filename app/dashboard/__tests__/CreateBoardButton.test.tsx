/**
 * Unit tests for the CreateBoardButton dashboard component.
 *
 * Covers:
 *   1. "Create New Board" button is visible on render.
 *   2. Clicking the button opens the modal dialog.
 *   3. Cancel button closes the modal without creating a board.
 *   4. The board name input accepts text entry when the modal is open.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { CreateBoardButton } from "../CreateBoardButton";

// ---------------------------------------------------------------------------
// Mock createBoard server action
// ---------------------------------------------------------------------------

vi.mock("../actions", () => ({
  createBoard: vi.fn().mockResolvedValue(undefined),
  deleteBoard: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Helper: open the dialog, then return it so tests can scope queries inside
// ---------------------------------------------------------------------------

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: /create new board/i }));
  return document.querySelector("dialog")!;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CreateBoardButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the 'Create New Board' button", () => {
    render(<CreateBoardButton />);
    expect(screen.getByRole("button", { name: /create new board/i })).toBeInTheDocument();
  });

  it("clicking the button opens the modal dialog", () => {
    render(<CreateBoardButton />);
    const dialog = document.querySelector("dialog")!;
    expect(dialog.open).toBe(false);

    openDialog();
    expect(dialog.open).toBe(true);
  });

  it("Cancel closes the modal", () => {
    render(<CreateBoardButton />);
    const dialog = openDialog();
    expect(dialog.open).toBe(true);

    fireEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));
    expect(dialog.open).toBe(false);
  });

  it("the board name input accepts text entry when the modal is open", () => {
    render(<CreateBoardButton />);
    const dialog = openDialog();

    // The input is inside the now-open dialog
    const input = within(dialog).getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Q4 Roadmap" } });
    expect(input.value).toBe("Q4 Roadmap");
  });
});
