"use client";

import { useRef, useState } from "react";
import { createBoard } from "./actions";
import { Plus } from "lucide-react";
import styles from "./page.module.css";

export function CreateBoardButton() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [boardName, setBoardName] = useState("");

  const openModal = () => {
    setBoardName("");
    dialogRef.current?.showModal();
  };

  const closeModal = () => {
    dialogRef.current?.close();
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={styles.createButton}
      >
        <Plus />
        Create New Board
      </button>
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        onCancel={closeModal}
      >
        <h2 className={styles.dialogTitle}>New board</h2>
        <form
          action={createBoard}
          className={styles.dialogForm}
          onSubmit={() => closeModal()}
        >
          <label htmlFor="board-name" className={styles.dialogLabel}>
            Board name
          </label>
          <input
            id="board-name"
            name="title"
            type="text"
            value={boardName}
            onChange={(e) => setBoardName(e.target.value)}
            placeholder="e.g. Sprint Planning"
            className={styles.dialogInput}
            autoFocus
          />
          <div className={styles.dialogActions}>
            <button type="button" onClick={closeModal} className={styles.dialogCancel}>
              Cancel
            </button>
            <button type="submit" className={styles.dialogSubmit}>
              Create
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
