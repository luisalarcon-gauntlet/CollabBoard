import { Whiteboard } from "@/components/Whiteboard";
import { AIChat } from "@/components/AIChat";
import { SignOutButton } from "@clerk/nextjs";
import { LogOut } from "lucide-react";
import styles from "./page.module.css";

export default function BoardPage() {
  return (
    <div className={styles.container}>
      {/* Sign Out Button - Top Right */}
      <div className={styles.signOutButtonWrapper}>
        <SignOutButton redirectUrl="/">
          <button className={styles.signOutButton}>
            <LogOut />
            Sign Out
          </button>
        </SignOutButton>
      </div>

      {/* Whiteboard */}
      <Whiteboard />

      {/* AI Board Agent — fixed overlay, canvas events pass through */}
      <AIChat />
    </div>
  );
}
