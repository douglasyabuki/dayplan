import type { DraftEntry } from "@/lib/tasks/editor";
import { reference, resolveOccurrence } from "@/lib/tasks/recurrence";
import type { Workspace } from "@/types-and-constants/workspace";

/** Compare data independently of object property insertion order. */
export function contentKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(contentKey).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${contentKey(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export type DraftExpectation = { entry: DraftEntry; key: string };

/** Include the template subtree, ancestors, recurrence root, and exception dependencies. */
export function draftKey(state: Workspace, entry: DraftEntry): string {
  const ids = new Set<string>(entry.isNew ? [] : [entry.original.taskId]);
  const parent =
    "parentId" in entry.changes
      ? entry.changes.parentId
      : (entry.parentRef?.taskId ?? entry.original.parentId);
  if (parent) ids.add(parent);
  if (entry.original.context)
    ids.add(entry.original.context.recurrenceRootTaskId);
  const fields = { ...entry.original, ...entry.changes };
  const descendants = new Set(entry.isNew ? [] : [entry.original.taskId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of state.tasks) {
      if (ids.has(task.id) && task.parentId && !ids.has(task.parentId)) {
        ids.add(task.parentId);
        changed = true;
      }
      if (
        task.parentId &&
        descendants.has(task.parentId) &&
        !descendants.has(task.id)
      ) {
        descendants.add(task.id);
        ids.add(task.id);
        changed = true;
      }
    }
    for (const e of Object.values(state.exceptions)) {
      if (ids.has(e.taskId) && e.parentRef && !ids.has(e.parentRef.taskId)) {
        ids.add(e.parentRef.taskId);
        changed = true;
      }
    }
  }
  return contentKey({
    ids: [...ids].sort(),
    tasks: state.tasks
      .filter((t) => ids.has(t.id))
      .sort((a, b) => a.id.localeCompare(b.id)),
    exceptions: Object.fromEntries(
      Object.entries(state.exceptions).filter(
        ([, e]) =>
          ids.has(e.taskId) ||
          (!!e.context && ids.has(e.context.recurrenceRootTaskId)),
      ),
    ),
    occurrence: entry.isNew
      ? null
      : resolveOccurrence(state, reference(entry.original)),
    parent: entry.parentRef ? resolveOccurrence(state, entry.parentRef) : null,
    project: fields.projectId
      ? state.projects.find((p) => p.id === fields.projectId)
      : null,
    section: fields.sectionId
      ? state.sections.find((s) => s.id === fields.sectionId)
      : null,
    tags: fields.tagIds.map(
      (id) => state.tags.find((t) => t.id === id) ?? null,
    ),
  });
}

export function draftCanApply(
  state: Workspace,
  entry: DraftEntry,
  newIds = new Set<string>(),
): boolean {
  if (entry.isNew && state.tasks.some((t) => t.id === entry.original.taskId))
    return false;
  if (!entry.isNew && !resolveOccurrence(state, reference(entry.original)))
    return false;
  if (
    entry.parentRef &&
    !newIds.has(entry.parentRef.taskId) &&
    !resolveOccurrence(state, entry.parentRef)
  )
    return false;
  const fields = { ...entry.original, ...entry.changes };
  if (
    fields.projectId &&
    !state.projects.some((p) => p.id === fields.projectId)
  )
    return false;
  if (
    fields.sectionId &&
    !state.sections.some((s) => s.id === fields.sectionId)
  )
    return false;
  if (fields.tagIds.some((id) => !state.tags.some((t) => t.id === id)))
    return false;
  const parent =
    "parentId" in entry.changes
      ? entry.changes.parentId
      : entry.original.parentId;
  return (
    !parent || newIds.has(parent) || state.tasks.some((t) => t.id === parent)
  );
}

export function assertDraftsCurrent(
  state: Workspace,
  expectations: DraftExpectation[],
) {
  const newIds = new Set(
    expectations
      .filter((e) => e.entry.isNew)
      .map((e) => e.entry.original.taskId),
  );
  for (const { entry, key } of expectations)
    if (draftKey(state, entry) !== key || !draftCanApply(state, entry, newIds))
      throw new Error(
        "This task changed. Review the remote changes before applying your draft.",
      );
}
