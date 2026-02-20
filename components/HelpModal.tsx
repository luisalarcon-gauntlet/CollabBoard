"use client";

import { useEffect } from "react";
import styles from "./HelpModal.module.css";

interface ShortcutRowProps {
  description: string;
  keys: string[];
}

function ShortcutRow({ description, keys }: ShortcutRowProps) {
  return (
    <div className={styles.shortcutRow}>
      <span className={styles.shortcutDesc}>{description}</span>
      <span className={styles.keys}>
        {keys.map((k, i) => (
          <span key={i}>
            {i > 0 && <span className={styles.keySep}>+</span>}
            <kbd className={styles.key}>{k}</kbd>
          </span>
        ))}
      </span>
    </div>
  );
}

interface HelpModalProps {
  onClose: () => void;
}

export function HelpModal({ onClose }: HelpModalProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className={styles.overlay}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Keyboard Shortcuts">
        <div className={styles.header}>
          <h2 className={styles.title}>Keyboard Shortcuts</h2>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className={styles.section}>
          <p className={styles.sectionTitle}>Tools</p>
          <div className={styles.shortcutList}>
            <ShortcutRow description="Select tool" keys={["V"]} />
            <ShortcutRow description="Hand / Pan tool" keys={["H"]} />
            <ShortcutRow description="Connector tool" keys={["C"]} />
            <ShortcutRow description="Temporary pan (hold)" keys={["Space"]} />
            <ShortcutRow description="Cancel connector / exit tool" keys={["Esc"]} />
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.section}>
          <p className={styles.sectionTitle}>Selection</p>
          <div className={styles.shortcutList}>
            <ShortcutRow description="Select all objects" keys={["⌘", "A"]} />
            <ShortcutRow description="Add / remove from selection" keys={["Shift", "Click"]} />
            <ShortcutRow description="Marquee select" keys={["Drag"]} />
            <ShortcutRow description="Deselect all" keys={["Esc"]} />
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.section}>
          <p className={styles.sectionTitle}>Connectors</p>
          <div className={styles.shortcutList}>
            <ShortcutRow description="Activate connector tool" keys={["C"]} />
            <ShortcutRow description="Draw connector" keys={["Drag"]} />
            <ShortcutRow description="Hover shape to see anchors" keys={["—"]} />
            <ShortcutRow description="Temporary pan while drawing" keys={["Space"]} />
            <ShortcutRow description="Cancel in-progress connector" keys={["Esc"]} />
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.section}>
          <p className={styles.sectionTitle}>Edit</p>
          <div className={styles.shortcutList}>
            <ShortcutRow description="Duplicate selection" keys={["⌘", "D"]} />
            <ShortcutRow description="Copy" keys={["⌘", "C"]} />
            <ShortcutRow description="Paste" keys={["⌘", "V"]} />
            <ShortcutRow description="Delete selected" keys={["Del"]} />
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.section}>
          <p className={styles.sectionTitle}>View</p>
          <div className={styles.shortcutList}>
            <ShortcutRow description="Zoom in / out" keys={["Scroll"]} />
            <ShortcutRow description="Reset view" keys={["Home"]} />
            <ShortcutRow description="Show this help" keys={["?"]} />
          </div>
        </div>
      </div>
    </div>
  );
}
