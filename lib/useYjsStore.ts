"use client";

import { useEffect, useState, useCallback } from "react";
import { sharedLayers, type LayerData } from "./yjs-store";

/**
 * Subscribe to the shared Yjs "layers" map and force a React re-render
 * whenever the map changes (local or remote).
 */
export function useYjsStore(): Map<string, LayerData> {
  const [snapshot, setSnapshot] = useState<Map<string, LayerData>>(
    () => new Map(sharedLayers.entries())
  );

  const refresh = useCallback(() => {
    setSnapshot(new Map(sharedLayers.entries()));
  }, []);

  useEffect(() => {
    sharedLayers.observe(refresh);
    // Hydrate once in case data arrived before mount
    refresh();
    return () => {
      sharedLayers.unobserve(refresh);
    };
  }, [refresh]);

  return snapshot;
}
