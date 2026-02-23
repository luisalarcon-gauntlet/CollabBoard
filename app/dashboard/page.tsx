import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { CreateBoardButton } from "./CreateBoardButton";
import { BoardCard } from "./BoardCard";
import styles from "./page.module.css";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }

  const { data: boards, error } = await supabase
    .from("boards")
    .select("id, title, created_at")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Dashboard] Failed to fetch boards:", error.message);
  }
  const list = boards ?? [];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>My Boards</h1>
        <div className={styles.headerActions}>
          <CreateBoardButton />
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>
      <div className={styles.grid}>
        {list.length === 0 ? (
          <p className={styles.empty}>No boards yet. Create one to get started.</p>
        ) : (
          list.map((board) => (
            <BoardCard
              key={board.id}
              id={board.id}
              title={board.title}
              createdAt={board.created_at}
            />
          ))
        )}
      </div>
    </div>
  );
}
