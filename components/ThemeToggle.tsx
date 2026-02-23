"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle({ variant = "default" }: { variant?: "default" | "canvas" }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Render a placeholder with the same dimensions to avoid layout shift
  if (!mounted) {
    return (
      <div
        className={
          variant === "canvas"
            ? "w-8 h-8"
            : "w-8 h-8 rounded-full"
        }
      />
    );
  }

  const isDark = theme === "dark";

  if (variant === "canvas") {
    return (
      <button
        type="button"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label="Toggle dark mode"
        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.4rem",
          padding: "0.45rem 0.9rem",
          fontSize: "0.8125rem",
          fontWeight: 500,
          color: isDark ? "#d1d5db" : "#374151",
          background: isDark ? "rgba(31, 41, 55, 0.85)" : "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: isDark ? "1px solid rgba(75, 85, 99, 0.7)" : "1px solid rgba(228, 228, 231, 0.7)",
          borderRadius: "9999px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.08)",
          cursor: "pointer",
          transition: "all 180ms ease",
        }}
      >
        {isDark ? <Sun size={15} /> : <Moon size={15} />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle dark mode"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex items-center justify-center w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800 text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-700 transition-all duration-150 shadow-sm"
    >
      {isDark ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
