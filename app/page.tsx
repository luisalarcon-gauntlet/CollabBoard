import { auth } from "@clerk/nextjs/server";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import Link from "next/link";
import styles from "./page.module.css";

export default async function Home() {
  const { userId } = await auth();

  if (userId) {
    redirect("/dashboard");
  }

  return (
    <div className={styles.page}>
      {/* Ambient background orbs */}
      <div className={styles.orbBlue} aria-hidden="true" />
      <div className={styles.orbViolet} aria-hidden="true" />
      <div className={styles.orbIndigo} aria-hidden="true" />

      {/* ── Nav ── */}
      <header className={styles.header}>
        <span className={styles.logo}>
          <span className={styles.logoIcon}>✦</span> ThinkSpace AI
        </span>
        <nav className={styles.navActions}>
          <SignInButton mode="redirect">
            <button className={styles.navSignIn}>Sign In</button>
          </SignInButton>
          <SignUpButton mode="redirect">
            <button className={styles.navSignUp}>Get Started</button>
          </SignUpButton>
        </nav>
      </header>

      {/* ── Hero ── */}
      <main className={styles.hero}>
        <div className={styles.badge}>✦ Now in open beta</div>

        <h1 className={styles.headline}>
          ThinkSpace AI
          <span className={styles.headlineAccent}>
            {" "}Collaborative Whiteboard
          </span>
        </h1>

        <p className={styles.description}>
          A boundless canvas where ideas take shape. Sketch, plan, and
          collaborate with your team in real time — no friction, just flow.
        </p>

        <div className={styles.ctaRow}>
          <Link href="/dashboard" className={styles.ctaPrimary}>
            Open Dashboard →
          </Link>
          <SignUpButton mode="redirect">
            <button className={styles.ctaSecondary}>Start for free</button>
          </SignUpButton>
        </div>

        {/* ── Sneak Peek mockup ── */}
        <div className={styles.mockupWrapper}>
          <div className={styles.mockupChrome}>
            <span className={styles.dot} style={{ background: "#ff5f57" }} />
            <span className={styles.dot} style={{ background: "#febc2e" }} />
            <span className={styles.dot} style={{ background: "#28c840" }} />
            <span className={styles.mockupUrl}>app.thinkspaceai.io/board</span>
          </div>
          <div className={styles.mockupScreen}>
            {/* Placeholder grid canvas feel */}
            <div className={styles.canvasGrid} aria-hidden="true" />
            <div className={styles.mockupLabel}>
              <span className={styles.mockupLabelIcon}>🖼</span>
              <span>Your screenshot goes here</span>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} ThinkSpace AI. All rights reserved.</span>
        <div className={styles.footerLinks}>
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
          <a href="#">Contact</a>
        </div>
      </footer>
    </div>
  );
}
