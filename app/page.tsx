import { auth } from "@clerk/nextjs/server";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import styles from "./page.module.css";

export default async function Home() {
  const { userId } = await auth();

  // If user is already authenticated, redirect to dashboard
  if (userId) {
    redirect("/dashboard");
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        {/* Logo/Branding */}
        <div className={styles.branding}>
          <h1 className={styles.title}>
            CollabBoard
          </h1>
          <p className={styles.subtitle}>
            Enterprise collaborative whiteboard for seamless team collaboration
          </p>
        </div>

        {/* Auth Buttons */}
        <div className={styles.authButtons}>
          <SignInButton mode="redirect">
            <button className={styles.signInButton}>
              Sign In
            </button>
          </SignInButton>
          
          <SignUpButton mode="redirect">
            <button className={styles.signUpButton}>
              Sign Up
            </button>
          </SignUpButton>
        </div>
      </div>
    </div>
  );
}
