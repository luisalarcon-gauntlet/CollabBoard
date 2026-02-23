import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { CreateBoardButton } from "./CreateBoardButton";
import { BoardCard } from "./BoardCard";
import { ThemeToggle } from "@/components/ThemeToggle";
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
    <div className={`${styles.page} dark:bg-gray-950`}>
      {/* ── Top Nav ── */}
      <nav className={`${styles.nav} dark:bg-gray-900/85 dark:border-gray-800`}>
        <span className={`${styles.navLogo} dark:text-white`}>
          <span className={styles.navLogoIcon}>✦</span> ThinkSpace AI
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserButton afterSignOutUrl="/" />
        </div>
      </nav>

      {/* ── Main content ── */}
      <main className={styles.main}>
        <div className={styles.pageHeader}>
          <h1 className={`${styles.pageTitle} dark:text-white`}>My Boards</h1>
          <p className={`${styles.pageSubtitle} dark:text-slate-400`}>
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
