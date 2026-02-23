"use client";

import { useEffect, useState, useCallback } from "react";
import { getSharedLayers, getProvider, type LayerData } from "./yjs-store";

/**
 * Subscribe to the shared Yjs "layers" map for the given board and force a
 * React re-render whenever the map changes (local or remote).
 *
 * Also awaits the provider's `loaded` promise so that data applied by
 * loadFromDb before the observer was attached is captured.
 */
export function useYjsStore(boardId: string | null | undefined): Map<string, LayerData> {
  const [snapshot, setSnapshot] = useState<Map<string, LayerData>>(() => new Map());

  const refresh = useCallback(() => {
    const layers = getSharedLayers(boardId ?? null);
    setSnapshot(layers ? new Map(layers.entries()) : new Map());
  }, [boardId]);

  useEffect(() => {
    const layers = getSharedLayers(boardId ?? null);
    if (!layers) {
      setSnapshot(new Map());
      return;
    }
    refresh();
    layers.observe(refresh);

    let cancelled = false;
    const provider = getProvider(boardId ?? null);
    if (provider) {
      provider.loaded.then(() => {
        if (!cancelled) refresh();
      });
    }

    return () => {
      cancelled = true;
      layers.unobserve(refresh);
    };
  }, [boardId, refresh]);

  return snapshot;
}
