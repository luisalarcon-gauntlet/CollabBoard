/**
 * Custom Yjs provider backed by Supabase Realtime (broadcast) for live sync
 * and Supabase Postgres (yjs_updates table) for persistence.
 *
 * Replaces the broken y-supabase alpha package with a production-quality
 * implementation that only depends on @supabase/supabase-js, yjs, and
 * y-protocols.
 */

import * as Y from "yjs";
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from "y-protocols/awareness";
import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";

export interface SupabaseYjsProviderOptions {
  /** Room / channel identifier */
  roomId: string;
  /** Supabase table storing doc snapshots */
  tableName?: string;
  /** Column name for the binary content */
  columnName?: string;
  /** Column name for the room identifier */
  roomColumn?: string;
  /** How often (ms) to persist the full doc to the DB. 0 = never auto-save. */
  saveInterval?: number;
}

const DEFAULT_OPTS: Required<Omit<SupabaseYjsProviderOptions, "roomId">> = {
  tableName: "yjs_updates",
  columnName: "content",
  roomColumn: "room_id",
  saveInterval: 5_000,
};

export class SupabaseYjsProvider {
  readonly doc: Y.Doc;
  readonly awareness: Awareness;

  private supabase: SupabaseClient;
  private opts: Required<SupabaseYjsProviderOptions>;
  private channel: RealtimeChannel | null = null;
  private saveTimer: ReturnType<typeof setInterval> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(
    doc: Y.Doc,
    supabase: SupabaseClient,
    options: SupabaseYjsProviderOptions
  ) {
    this.doc = doc;
    this.supabase = supabase;
    this.opts = { ...DEFAULT_OPTS, ...options } as Required<SupabaseYjsProviderOptions>;

    this.awareness = new Awareness(doc);

    this.init();
  }

  /* ------------------------------------------------------------------ */
  /*  Initialisation                                                     */
  /* ------------------------------------------------------------------ */

  private async init() {
    await this.loadFromDb();
    this.setupChannel();
    this.setupDocListener();
    this.setupAwarenessListener();

    if (this.opts.saveInterval > 0) {
      this.saveTimer = setInterval(() => this.saveToDb(), this.opts.saveInterval);
    }

    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", this.handleUnload);
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Persistence: load / save full doc state to Supabase table          */
  /* ------------------------------------------------------------------ */

  private async loadFromDb() {
    const { tableName, columnName, roomColumn, roomId } = this.opts;
    const { data, error } = await this.supabase
      .from(tableName)
      .select(columnName)
      .eq(roomColumn, roomId)
      .maybeSingle();

    if (error) {
      // Load failure is normal if the table doesn't exist yet or RLS blocks anon.
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[SupabaseYjsProvider] Could not load initial state:",
          error.message,
          "— Run supabase/schema.sql and add RLS policies if you need persistence."
        );
      }
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = data as any;
    if (row && row[columnName] != null) {
      try {
        const raw = row[columnName];
        const bytes = decodeContentToUint8(raw);
        Y.applyUpdate(this.doc, bytes);
        if (process.env.NODE_ENV === "development") {
          console.log("[SupabaseYjsProvider] Loaded initial state from DB.");
        }
      } catch (e) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[SupabaseYjsProvider] Failed to apply stored update:", e);
        }
      }
    } else if (process.env.NODE_ENV === "development") {
      console.log("[SupabaseYjsProvider] No saved state in DB (empty board).");
    }
  }

  async saveToDb() {
    if (this.destroyed) return;
    const { tableName, columnName, roomColumn, roomId } = this.opts;
    const state = Y.encodeStateAsUpdate(this.doc);
    const encoded = uint8ToBase64(state);

    const { error } = await this.supabase
      .from(tableName)
      .upsert(
        { [roomColumn]: roomId, [columnName]: encoded },
        { onConflict: roomColumn }
      );

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[SupabaseYjsProvider] Save failed:",
          error.message,
          "— Check that yjs_updates exists, content column is TEXT, and RLS allows insert/update."
        );
      }
    } else if (process.env.NODE_ENV === "development") {
      console.log("[SupabaseYjsProvider] Saved state to DB.");
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Realtime: broadcast doc updates + awareness via Supabase channel   */
  /* ------------------------------------------------------------------ */

  private setupChannel() {
    const { roomId } = this.opts;

    this.channel = this.supabase.channel(`yjs-${roomId}`, {
      config: { broadcast: { self: false } },
    });

    this.channel
      .on("broadcast", { event: "yjs-update" }, ({ payload }) => {
        try {
          const update = decodeContentToUint8(payload.update as string);
          Y.applyUpdate(this.doc, update, "remote");
        } catch (e) {
          console.error("[SupabaseYjsProvider] bad remote update:", e);
        }
      })
      .on("broadcast", { event: "yjs-awareness" }, ({ payload }) => {
        try {
          const update = decodeContentToUint8(payload.update as string);
          applyAwarenessUpdate(this.awareness, update, "remote");
        } catch (e) {
          console.error("[SupabaseYjsProvider] bad awareness update:", e);
        }
      })
      .subscribe();
  }

  /* ------------------------------------------------------------------ */
  /*  Doc & awareness observers                                          */
  /* ------------------------------------------------------------------ */

  private setupDocListener() {
    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (this.destroyed) return;
      if (origin !== "remote") {
        this.broadcastUpdate(update);
        // Debounced save: persist within 1s of the last local change.
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.saveToDb(), 1_000);
      }
    });
  }

  private setupAwarenessListener() {
    this.awareness.on(
      "update",
      ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
        const changedClients = [...added, ...updated, ...removed];
        const update = encodeAwarenessUpdate(this.awareness, changedClients);
        this.broadcastAwareness(update);
      }
    );
  }

  private broadcastUpdate(update: Uint8Array) {
    this.channel?.send({
      type: "broadcast",
      event: "yjs-update",
      payload: { update: uint8ToBase64(update) },
    });
  }

  private broadcastAwareness(update: Uint8Array) {
    this.channel?.send({
      type: "broadcast",
      event: "yjs-awareness",
      payload: { update: uint8ToBase64(update) },
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Cleanup                                                            */
  /* ------------------------------------------------------------------ */

  private handleUnload = () => {
    this.destroy();
  };

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.saveTimer) clearInterval(this.saveTimer);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.saveToDb();

    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", this.handleUnload);
    }

    this.channel?.unsubscribe();
    this.awareness.destroy();
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers: base64 / hex <-> Uint8Array                               */
/* ------------------------------------------------------------------ */

function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/** Decode DB content to bytes. Supports base64 string (TEXT column) or hex string (bytea output). */
function decodeContentToUint8(raw: unknown): Uint8Array {
  if (raw instanceof Uint8Array) return raw;
  const str = typeof raw === "string" ? raw : String(raw);
  // Postgres bytea hex format: "\x" + hex digits (backslash + 'x' in string)
  if (str.length > 2 && str[0] === "\\" && str[1] === "x") {
    const hex = str.slice(2);
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }
  // Base64 (TEXT column or legacy)
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(str, "base64"));
  }
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
