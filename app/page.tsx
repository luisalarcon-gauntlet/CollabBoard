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

      {/* ── Hero — split layout ── */}
      <main className={styles.hero}>

        {/* Left column — copy */}
        <div className={styles.heroLeft}>
          <div className={styles.badge}>✦ Now in open beta</div>

          <h1 className={styles.headline}>
            The canvas where
            <span className={styles.headlineAccent}> great work happens</span>
          </h1>

          <p className={styles.description}>
            A boundless real-time whiteboard built for modern teams. Sketch,
            plan, and collaborate — no friction, just flow.
          </p>

          <div className={styles.ctaRow}>
            <SignUpButton mode="redirect">
              <button className={styles.ctaPrimary}>Get started free →</button>
            </SignUpButton>
            <Link href="/dashboard" className={styles.ctaSecondary}>
              Open dashboard
            </Link>
          </div>

          {/* Social proof */}
          <div className={styles.trustRow}>
            <div className={styles.trustAvatars}>
              <span className={styles.trustAvatar} style={{ background: "#6366f1" }}>A</span>
              <span className={styles.trustAvatar} style={{ background: "#ec4899" }}>S</span>
              <span className={styles.trustAvatar} style={{ background: "#14b8a6" }}>M</span>
              <span className={styles.trustAvatar} style={{ background: "#f59e0b" }}>J</span>
            </div>
            <span className={styles.trustText}>
              Joined by <strong>1,000+</strong> teams worldwide
            </span>
          </div>

          {/* Feature pills */}
          <div className={styles.featureRow}>
            <div className={styles.feature}>
              <span className={styles.featureIcon}>⚡</span>Real-time sync
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon}>∞</span>Infinite canvas
            </div>
            <div className={styles.feature}>
              <span className={styles.featureIcon}>✦</span>AI-powered
            </div>
          </div>
        </div>

        {/* Right column — animated mockup */}
        <div className={styles.heroRight}>
          <div className={styles.mockupWrapper}>
            <div className={styles.mockupChrome}>
              <span className={styles.dot} style={{ background: "#ff5f57" }} />
              <span className={styles.dot} style={{ background: "#febc2e" }} />
              <span className={styles.dot} style={{ background: "#28c840" }} />
              <span className={styles.mockupUrl}>app.thinkspaceai.io/board</span>
            </div>
            <div className={styles.mockupScreen}>
              <div className={styles.canvasGrid} aria-hidden="true" />

              {/* ── Animated canvas SVG ── */}
              <svg
                className={styles.canvasMockup}
                viewBox="0 0 860 400"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                {/* Frames */}
                <rect x="30" y="30" width="260" height="160" rx="8"
                  fill="rgba(241,245,249,0.06)" stroke="rgba(148,163,184,0.3)" strokeWidth="1.5" />
                <text x="45" y="52" fill="rgba(148,163,184,0.6)" fontSize="9" fontWeight="700" letterSpacing="0.06em">IDEATION</text>

                <rect x="580" y="210" width="250" height="165" rx="8"
                  fill="rgba(241,245,249,0.06)" stroke="rgba(148,163,184,0.3)" strokeWidth="1.5" />
                <text x="595" y="232" fill="rgba(148,163,184,0.6)" fontSize="9" fontWeight="700" letterSpacing="0.06em">DELIVERY</text>

                {/* Connector lines */}
                <line x1="235" y1="120" x2="300" y2="160" stroke="rgba(99,102,241,0.45)" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arrowBlue)" />
                <line x1="440" y1="155" x2="490" y2="200" stroke="rgba(99,102,241,0.45)" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arrowBlue)" />
                <line x1="560" y1="230" x2="598" y2="260" stroke="rgba(139,92,246,0.45)" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arrowViolet)" />
                <line x1="370" y1="305" x2="420" y2="270" stroke="rgba(99,102,241,0.35)" strokeWidth="1.5" strokeDasharray="4 3" />

                {/* Sticky 1 — amber */}
                <g className={styles.floatA}>
                  <rect x="60" y="65" width="160" height="110" rx="6" fill="#fef3c7" />
                  <rect x="60" y="65" width="160" height="5" rx="3" fill="#fde68a" />
                  <text x="75" y="92" fill="#78350f" fontSize="10" fontWeight="700">User Research</text>
                  <text x="75" y="110" fill="#92400e" fontSize="8.5">• Interview findings</text>
                  <text x="75" y="124" fill="#92400e" fontSize="8.5">• Pain points map</text>
                  <text x="75" y="138" fill="#92400e" fontSize="8.5">• Opportunity areas</text>
                  <rect x="57" y="62" width="166" height="116" rx="8" fill="none" stroke="#6366f1" strokeWidth="1.5" strokeDasharray="3 2" opacity="0.6" />
                </g>

                {/* Sticky 2 — blue */}
                <g className={styles.floatB}>
                  <rect x="620" y="245" width="155" height="95" rx="6" fill="#dbeafe" />
                  <rect x="620" y="245" width="155" height="5" rx="3" fill="#93c5fd" />
                  <text x="635" y="270" fill="#1e3a8a" fontSize="10" fontWeight="700">Sprint Goals</text>
                  <text x="635" y="287" fill="#1e40af" fontSize="8.5">• Ship v2 auth flow</text>
                  <text x="635" y="300" fill="#1e40af" fontSize="8.5">• E2E test coverage</text>
                  <text x="635" y="313" fill="#1e40af" fontSize="8.5">• Perf audit</text>
                </g>

                {/* Sticky 3 — green */}
                <g className={styles.floatC}>
                  <rect x="620" y="355" width="155" height="70" rx="6" fill="#dcfce7" />
                  <rect x="620" y="355" width="155" height="5" rx="3" fill="#86efac" />
                  <text x="635" y="378" fill="#14532d" fontSize="10" fontWeight="700">Done ✓</text>
                  <text x="635" y="394" fill="#166534" fontSize="8.5">• Design system tokens</text>
                  <text x="635" y="408" fill="#166534" fontSize="8.5">• CI pipeline</text>
                </g>

                {/* Rectangle shape */}
                <g className={styles.floatA}>
                  <rect x="300" y="120" width="140" height="90" rx="6" fill="#c7d2fe" stroke="#818cf8" strokeWidth="1.5" />
                  <text x="370" y="158" fill="#1e1b4b" fontSize="11" fontWeight="700" textAnchor="middle">Wireframes</text>
                  <text x="370" y="175" fill="#312e81" fontSize="8.5" textAnchor="middle">3 flows ready</text>
                </g>

                {/* Circle shape */}
                <g className={styles.floatB}>
                  <circle cx="525" cy="210" r="52" fill="#bbf7d0" stroke="#4ade80" strokeWidth="1.5" />
                  <text x="525" y="206" fill="#14532d" fontSize="10" fontWeight="700" textAnchor="middle">Prototype</text>
                  <text x="525" y="221" fill="#166534" fontSize="8.5" textAnchor="middle">v0.4 — live</text>
                </g>

                {/* Text element */}
                <g className={styles.floatC}>
                  <text x="310" y="300" fill="rgba(226,232,240,0.85)" fontSize="13" fontWeight="800" letterSpacing="-0.02em">ThinkSpace AI</text>
                  <text x="310" y="318" fill="rgba(148,163,184,0.7)" fontSize="9">Collaborative canvas for modern teams</text>
                </g>

                {/* Freehand squiggle */}
                <polyline
                  points="140,250 165,238 188,252 210,242 232,254"
                  fill="none" stroke="rgba(251,191,36,0.7)" strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round"
                />

                {/* Cursor 1 — violet */}
                <g className={styles.cursor1}>
                  <path d="M430 100 L425 118 L430 114 L434 122 L437 121 L433 113 L440 113 Z"
                    fill="#8b5cf6" stroke="white" strokeWidth="1" />
                  <rect x="443" y="100" width="52" height="16" rx="4" fill="#8b5cf6" />
                  <text x="448" y="112" fill="white" fontSize="8" fontWeight="600">Alex K.</text>
                </g>

                {/* Cursor 2 — rose */}
                <g className={styles.cursor2}>
                  <path d="M180 290 L175 308 L180 304 L184 312 L187 311 L183 303 L190 303 Z"
                    fill="#f43f5e" stroke="white" strokeWidth="1" />
                  <rect x="193" y="290" width="46" height="16" rx="4" fill="#f43f5e" />
                  <text x="198" y="302" fill="white" fontSize="8" fontWeight="600">Sam R.</text>
                </g>

                <defs>
                  <marker id="arrowBlue" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
                    <polygon points="0 0, 7 3.5, 0 7" fill="rgba(99,102,241,0.7)" />
                  </marker>
                  <marker id="arrowViolet" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
                    <polygon points="0 0, 7 3.5, 0 7" fill="rgba(139,92,246,0.7)" />
                  </marker>
                </defs>
              </svg>
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
