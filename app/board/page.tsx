import { Whiteboard } from "@/components/Whiteboard";
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
    </div>
  );
}
