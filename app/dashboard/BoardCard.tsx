"use client";

import { useTransition, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteBoard } from "./actions";
import styles from "./page.module.css";

type BoardCardProps = {
  id: string;
  title: string;
  createdAt: string;
};

export function BoardCard({ id, title, createdAt }: BoardCardProps) {
  const router = useRouter();
  const date = new Date(createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const [isPending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dialogRef.current?.showModal();
  };

  const handleConfirm = () => {
    dialogRef.current?.close();
    startTransition(() => {
      void deleteBoard(id).then(() => {
        router.refresh();
      });
    });
  };

  const handleCancel = () => {
    dialogRef.current?.close();
  };

  return (
    <>
      <div className={`${styles.card} ${isPending ? styles.cardDeleting : ""}`}>
        <Link href={`/board/${id}`} className={styles.cardLink}>
          <span className={styles.cardTitle}>{title}</span>
          <span className={styles.cardDate} suppressHydrationWarning>
            {date}
          </span>
        </Link>
        <button
          type="button"
          onClick={handleDeleteClick}
          disabled={isPending}
          className={styles.deleteButton}
          aria-label={`Delete board "${title}"`}
          title="Delete board"
        >
          <Trash2 size={15} />
        </button>
      </div>

      <dialog ref={dialogRef} className={styles.dialog} onCancel={handleCancel}>
        <h2 className={styles.dialogTitle}>Delete board?</h2>
        <div className={styles.dialogForm}>
          <p className={styles.dialogDescription}>
            <strong>{title}</strong> will be permanently deleted. This cannot be undone.
          </p>
          <div className={styles.dialogActions}>
            <button type="button" onClick={handleCancel} className={styles.dialogCancel}>
              Cancel
            </button>
            <button type="button" onClick={handleConfirm} className={styles.dialogDelete}>
              Delete
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
