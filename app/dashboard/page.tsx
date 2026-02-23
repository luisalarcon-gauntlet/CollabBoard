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
    <div className={styles.page}>
      {/* ── Top Nav ── */}
      <nav className={styles.nav}>
        <span className={styles.navLogo}>
          <span className={styles.navLogoIcon}>✦</span> ThinkSpace AI
        </span>
        <UserButton afterSignOutUrl="/" />
      </nav>

      {/* ── Main content ── */}
      <main className={styles.main}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>My Boards</h1>
          <p className={styles.pageSubtitle}>
            Pick up where you left off, or start something new.
          </p>
        </div>

        <div className={styles.grid}>
          {/* Dashed "create" card always first */}
          <CreateBoardButton variant="card" />

          {list.map((board) => (
            <BoardCard
              key={board.id}
              id={board.id}
              title={board.title}
              createdAt={board.created_at}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
