"use client";

import { useState, useRef, useEffect, useCallback, FormEvent } from "react";
import { Sparkles, Send, ChevronDown } from "lucide-react";
import { sharedLayers, ydoc } from "@/lib/yjs-store";
import { executeAiTools, type AiToolCall } from "@/lib/ai-executor";
import styles from "./AIChat.module.css";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DisplayMessage {
  role: "user" | "assistant" | "error";
  content: string;
  tier?: "fast" | "reasoning";
}

/** Anthropic-compatible message history sent to the API. */
interface ApiMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_WORKING  = "AI is working…";
const STATUS_SLOW     = "Still generating…";
const SLOW_THRESHOLD  = 4_000; // ms before escalating the status label

// ── Helpers ───────────────────────────────────────────────────────────────────

function summariseToolCalls(toolCalls: AiToolCall[]): string {
  const counts: Record<string, number> = {};
  for (const tc of toolCalls) {
    counts[tc.name] = (counts[tc.name] ?? 0) + 1;
  }
  const parts = Object.entries(counts).map(([name, n]) => {
    const label = name.replace(/_/g, " ");
    return n === 1 ? label : `${label} ×${n}`;
  });
  return `Done — ${parts.join(", ")}.`;
}

/** Serialise the live Yjs layer map to a plain array for board context. */
function getBoardState() {
  return Array.from(sharedLayers.entries()).map(([id, layer]) => ({
    id,
    ...layer,
  }));
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AIChat() {
  const [isOpen,          setIsOpen]          = useState(false);
  const [input,           setInput]           = useState("");
  const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
  const [apiMessages,     setApiMessages]     = useState<ApiMessage[]>([]);
  const [isLoading,       setIsLoading]       = useState(false);
  const [statusText,      setStatusText]      = useState(STATUS_WORKING);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const slowTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages, isLoading]);

  // Clear the slow-response timer whenever loading finishes.
  useEffect(() => {
    if (!isLoading) {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      setStatusText(STATUS_WORKING);
    }
  }, [isLoading]);

  const startSlowTimer = useCallback(() => {
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    slowTimerRef.current = setTimeout(() => {
      setStatusText(STATUS_SLOW);
    }, SLOW_THRESHOLD);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    const text = input.trim();
    if (!text || isLoading) return;

    const userApiMsg: ApiMessage = { role: "user", content: text };
    const nextApiMessages = [...apiMessages, userApiMsg];

    setDisplayMessages((prev) => [...prev, { role: "user", content: text }]);
    setApiMessages(nextApiMessages);
    setInput("");

    // Show working state immediately — before the fetch even starts.
    setIsLoading(true);
    setStatusText(STATUS_WORKING);
    startSlowTimer();

    try {
      const boardState = getBoardState();

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextApiMessages, boardState }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json();
      const toolCalls: AiToolCall[] = data.toolCalls ?? [];
      const tier: "fast" | "reasoning" = data.tier ?? "fast";

      let assistantText: string;

      if (toolCalls.length > 0) {
        // Execute immediately — zero client-side delay after the response lands.
        executeAiTools(toolCalls, sharedLayers, ydoc);
        assistantText = summariseToolCalls(toolCalls);
      } else {
        assistantText = "No board changes were made.";
      }

      setDisplayMessages((prev) => [
        ...prev,
        { role: "assistant", content: assistantText, tier },
      ]);
      // Keep text-only history so follow-up turns remain valid.
      setApiMessages((prev) => [
        ...prev,
        { role: "assistant", content: assistantText },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setDisplayMessages((prev) => [
        ...prev,
        { role: "error", content: `Error: ${msg}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      {isOpen ? (
        <div className={styles.panel}>
          {/* ── Header ── */}
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <Sparkles size={15} className={styles.sparkles} />
              <span className={styles.title}>Board Agent</span>
            </div>
            <button
              className={styles.closeBtn}
              onClick={() => setIsOpen(false)}
              aria-label="Collapse AI chat"
            >
              <ChevronDown size={16} />
            </button>
          </div>

          {/* ── Messages ── */}
          <div className={styles.messages}>
            {displayMessages.length === 0 && (
              <p className={styles.empty}>
                Ask me to create shapes, sticky notes, or reorganize anything on
                the board.
              </p>
            )}

            {displayMessages.map((msg, i) => (
              <div
                key={i}
                className={`${styles.message} ${styles[msg.role]}`}
              >
                {msg.content}
                {msg.role === "assistant" && msg.tier && (
                  <span className={`${styles.tierBadge} ${styles[`tier_${msg.tier}`]}`}>
                    {msg.tier === "fast" ? "haiku" : "sonnet"}
                  </span>
                )}
              </div>
            ))}

            {isLoading && (
              <div className={`${styles.message} ${styles.assistant} ${styles.thinking}`}>
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.statusLabel}>{statusText}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Input ── */}
          <form onSubmit={handleSubmit} className={styles.inputRow}>
            <input
              className={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isLoading ? statusText : "Ask the AI agent…"}
              disabled={isLoading}
              autoComplete="off"
            />
            <button
              type="submit"
              className={styles.sendBtn}
              disabled={isLoading || !input.trim()}
              aria-label="Send message"
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      ) : (
        <button
          className={styles.fab}
          onClick={() => setIsOpen(true)}
          aria-label="Open AI Board Agent"
        >
          <Sparkles size={16} />
          <span>AI Agent</span>
        </button>
      )}
    </div>
  );
}
