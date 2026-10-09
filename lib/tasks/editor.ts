import type { Occurrence, TaskReference } from "@/types-and-constants/tasks";
import type { Workspace } from "@/types-and-constants/workspace";

import { expandTasks, reference, resolveOccurrence } from "./recurrence";

export type DraftEntry = {
  original: Occurrence;
  changes: Partial<Occurrence>;
  isNew: boolean;
  scope: "occurrence" | "series";
  parentRef?: TaskReference;
};

export type DraftEntries = Record<string, DraftEntry>;

/**
 * Builds an editing session by overlaying draft changes on expanded occurrences.
 * @param state Current workspace state.
 * @param entries Draft changes keyed by occurrence ID.
 * @param from First date key to expand.
 * @param to Last date key to expand.
 * @returns {Occurrence[]} Occurrences expanded for `[from, to]`, with each resolvable draft entry merged over its live occurrence and each `isNew` entry's `original` merged with its draft changes. Entries whose non-new original no longer resolves are omitted.
 * @example `sessionTasks(state, drafts, "2026-10-01", "2026-10-07")` returns that week's tasks with unsaved edits applied.
 */
export function sessionTasks(
  state: Workspace,
  entries: DraftEntries,
  from: string,
  to: string,
): Occurrence[] {
  const result = new Map(expandTasks(state, from, to).map((t) => [t.id, t]));
  for (const [id, entry] of Object.entries(entries)) {
    const live = entry.isNew
      ? entry.original
      : resolveOccurrence(state, reference(entry.original));
    if (live) result.set(id, { ...live, ...entry.changes });
  }
  return [...result.values()];
}
