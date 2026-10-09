"use client";

import { useEffect, useState } from "react";

import type { TagIndex } from "@/lib/tags/hierarchy";

export const TAG_EXPANSION_KEY = "dayplan.tags.collapsed.v1";

type TagExpansionOptions = {
  index: TagIndex;
  selectedId?: string;
};

/**
 * Persists collapsed tag branches and reveals the selected tag when navigation changes.
 * @param {TagExpansionOptions} options Tag hierarchy index and optional selected tag ID.
 * @returns {object} An object with `collapsed`, the set of collapsed tag IDs, `toggle(id)` to expand or collapse one ID, and `reveal(id)` to expand its ancestors. `reveal(null)` leaves the set unchanged.
 * @example
 * const { collapsed, toggle, reveal } = useTagExpansion({ index, selectedId });
 * reveal(tag.id);
 */
export function useTagExpansion({ index, selectedId }: TagExpansionOptions) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const stored: unknown = JSON.parse(
        localStorage.getItem(TAG_EXPANSION_KEY) ?? "[]",
      );
      return new Set(
        Array.isArray(stored)
          ? stored.filter((id): id is string => typeof id === "string")
          : [],
      );
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(TAG_EXPANSION_KEY, JSON.stringify([...collapsed]));
    } catch {
      /* Preferences are optional. */
    }
  }, [collapsed]);
  useEffect(() => {
    if (!selectedId) return;
    const ancestors = index.ancestors(selectedId).slice(1);
    // Navigation reveals the selected tag, including after reparenting.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCollapsed((previous) => {
      if (!ancestors.some((id) => previous.has(id))) return previous;
      const next = new Set(previous);
      ancestors.forEach((id) => next.delete(id));
      return next;
    });
  }, [index, selectedId]);
  return {
    collapsed,
    toggle(id: string) {
      setCollapsed((previous) => {
        const next = new Set(previous);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    reveal(id: string | null) {
      if (id === null) return;
      setCollapsed((previous) => {
        const next = new Set(previous);
        index.ancestors(id).forEach((key) => next.delete(key));
        return next;
      });
    },
  };
}
