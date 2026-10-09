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
