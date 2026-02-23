"use client";

import { useEffect, useState, useCallback } from "react";
import { getAwareness } from "./yjs-store";

export interface AwarenessUser {
  clientId: number;
  name: string;
  avatar?: string;
  cursor?: { x: number; y: number } | null;
}

/**
 * Subscribe to Yjs Awareness changes for the given board and return a list of
 * remote users (excludes local client). Returns [] when not on client or boardId is null.
 */
export function useAwareness(boardId: string | null | undefined): AwarenessUser[] {
  const [users, setUsers] = useState<AwarenessUser[]>([]);

  const refresh = useCallback(() => {
    const awareness = getAwareness(boardId ?? null);
    if (!awareness) return;
    const states = awareness.getStates();
    const localId = awareness.clientID;
    const result: AwarenessUser[] = [];
    states.forEach((state, clientId) => {
      if (clientId === localId) return;
      if (!state || !state.user) return;
      result.push({
        clientId,
        name: state.user.name ?? "Anonymous",
        avatar: state.user.avatar,
        cursor: state.user.cursor ?? null,
      });
    });
    setUsers(result);
  }, [boardId]);

  useEffect(() => {
    const awareness = getAwareness(boardId ?? null);
    if (!awareness) return;
    const handler = () => refresh();
    awareness.on("change", handler);
    refresh();
    return () => {
      awareness.off("change", handler);
    };
  }, [boardId, refresh]);

  return users;
}
