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
const MAX_HISTORY     = 6;     // keep last 3 user+assistant turn pairs

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

/**
 * Compact board state serialiser.
 * Strips defaults and uses short keys to minimise input tokens.
 * Only the 'id' field is consumed by the AI; the rest provides context.
 */
function getBoardState() {
  return Array.from(sharedLayers.entries()).map(([id, layer]) => {
    const l = layer as Record<string, unknown>;
    const entry: Record<string, unknown> = { id, t: layer.type };

    if (l.x != null)  entry.x = l.x;
    if (l.y != null)  entry.y = l.y;
    if (l.width  != null) entry.w = l.width;
    if (l.height != null) entry.h = l.height;

    // Unified color field (different names per layer type)
    const color = l.fill ?? l.bgColor ?? l.backgroundColor;
    if (color) entry.f = color;

    // Text color only if non-default
    if (l.color && l.color !== "#000000") entry.c = l.color;

    // Truncate long text so board state stays compact
    if (l.text)  entry.tx = (l.text as string).slice(0, 60);
    if (l.title) entry.ti = l.title;

    // Skip rotation when 0 (default)
    if (l.rotation && (l.rotation as number) !== 0) entry.r = l.rotation;

    return entry;
  });
}

/**
 * Decide whether to include the board state in the request.
 * Pure creation prompts don't need existing layer IDs.
 */
const NEEDS_BOARD_STATE_RE =
  /\b(rotate|move|delete|remove|update|recolor|resize|rearrange|arrange|scale|flip|all|every|existing|selected|current|them|those|these)\b/i;

function needsBoardState(text: string): boolean {
  return NEEDS_BOARD_STATE_RE.test(text);
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

    // Trim history to last MAX_HISTORY messages to keep input tokens bounded.
    const trimmedHistory = apiMessages.slice(-MAX_HISTORY);
    const nextApiMessages = [...trimmedHistory, userApiMsg];

    setDisplayMessages((prev) => [...prev, { role: "user", content: text }]);
    setApiMessages(nextApiMessages);
    setInput("");

    setIsLoading(true);
    setStatusText(STATUS_WORKING);
    startSlowTimer();

    const collectedCalls: AiToolCall[] = [];
    let tier: "fast" | "reasoning" = "fast";

    try {
      const boardState = needsBoardState(text) ? getBoardState() : [];

      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextApiMessages, boardState }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      // ── Parse SSE stream ────────────────────────────────────────────────────
      // Each fully-formed tool call is emitted as soon as it's assembled
      // server-side and executed immediately — no waiting for the full response.

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by double newline.
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(part.slice(6));
          } catch {
            continue;
          }

          if (parsed.type === "tool_call") {
            const tc: AiToolCall = {
              name:  parsed.name  as string,
              input: parsed.input as Record<string, unknown>,
            };
            collectedCalls.push(tc);
            // Execute each tool call the moment it arrives from the stream.
            executeAiTools([tc], sharedLayers, ydoc);
          } else if (parsed.type === "done") {
            tier = (parsed.tier as "fast" | "reasoning") ?? "fast";
          } else if (parsed.type === "error") {
            throw new Error(parsed.message as string);
          }
        }
      }

      const assistantText =
        collectedCalls.length > 0
          ? summariseToolCalls(collectedCalls)
          : "No board changes were made.";

      setDisplayMessages((prev) => [
        ...prev,
        { role: "assistant", content: assistantText, tier },
      ]);
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
