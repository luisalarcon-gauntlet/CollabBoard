import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { Whiteboard } from "@/components/Whiteboard";
import { AIChat } from "@/components/AIChat";
import { SignOutButton } from "@clerk/nextjs";
import { LogOut } from "lucide-react";
import { isValidUUID } from "@/lib/utils";
import { fetchBoardById } from "@/app/dashboard/actions";
import styles from "./page.module.css";

type Props = { params: Promise<{ id: string }> };

export default async function BoardPage({ params }: Props) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) {
    notFound();
  }

  if (!isValidUUID(id)) {
    notFound();
  }

  // Any authenticated user can open a board by its UUID (shared-link access).
  // The owner_id check has been intentionally removed: the UUID itself acts as
  // the access token for this MVP. Owner-only operations (delete, etc.) still
  // verify ownership independently in their respective server actions.
  const board = await fetchBoardById(id);
  if (!board) {
    notFound();
  }

  return (
    <div className={styles.container}>
      <div className={styles.signOutButtonWrapper}>
        <SignOutButton redirectUrl="/dashboard">
          <button className={styles.signOutButton}>
            <LogOut />
            Sign Out
          </button>
        </SignOutButton>
      </div>
      <Whiteboard key={id} boardId={id} />
      <AIChat boardId={id} />
    </div>
  );
}
