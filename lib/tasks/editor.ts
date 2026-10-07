import { taskDraftAction, validateTaskDraft } from "./operations";
import {
  asOccurrence,
  expandTasks,
  reference,
  resolveOccurrence,
} from "./recurrence";
import { reducer } from "./store";
import type { Occurrence, TaskReference, Workspace } from "./types";
export { taskDraftAction, taskFields, validateTaskDraft } from "./operations";

export type DraftEntry = {
  original: Occurrence;
  changes: Partial<Occurrence>;
  isNew: boolean;
  scope: "occurrence" | "series";
  parentRef?: TaskReference;
};
export type DraftEntries = Record<string, DraftEntry>;
/** Merge only staged fields with live state; immediate operations cannot be overwritten. */
export function commitDrafts(
  state: Workspace,
  entries: DraftEntries,
): Workspace {
  let next = state;
  for (const entry of Object.values(entries)) {
    const latest = entry.isNew
      ? entry.original
      : resolveOccurrence(next, reference(entry.original));
    if (!latest) continue;
    const draft = { ...latest, ...entry.changes };
    const error = validateTaskDraft(draft);
    if (error) throw new Error(error);
    if (entry.isNew && entry.parentRef && !("parentId" in entry.changes))
      draft.parentId = entry.parentRef.taskId;
    next = reducer(next, taskDraftAction(next, latest, draft, entry.scope));
  }
  return next;
}
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
export { asOccurrence };
