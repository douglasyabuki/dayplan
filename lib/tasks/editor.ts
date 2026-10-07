import { daysBetween, shiftDate } from "./dates";
import {
  asOccurrence,
  expandTasks,
  reference,
  resolveOccurrence,
} from "./recurrence";
import { type Action, materializeSubtree, reducer } from "./store";
import type { Occurrence, Task, TaskReference, Workspace } from "./types";

export function validateTaskDraft(draft: Task): string | undefined {
  if (!draft.title.trim()) return "Give this task a title.";
  const anchor = draft.schedule?.date ?? draft.deadline?.date;
  if (draft.recurrence && !anchor)
    return "Add a scheduled date or deadline before setting a repeat rule.";
  if (
    draft.recurrence?.frequency === "weekdays" &&
    !draft.recurrence.weekdays.length
  )
    return "Choose at least one weekday.";
  if (draft.recurrence?.until && anchor && draft.recurrence.until < anchor)
    return "The repeat end date must be on or after the first occurrence.";
}
export function taskFields(task: Occurrence): Task {
  const { taskId, context, ...fields } = task;
  void context;
  return {
    ...fields,
    id: taskId,
    projectId: fields.parentId ? null : fields.projectId,
    sectionId: fields.parentId ? null : fields.sectionId,
  };
}
export function taskDraftAction(
  state: Workspace,
  original: Occurrence,
  draft: Occurrence,
  scope: "occurrence" | "series",
  makeId = () => crypto.randomUUID(),
): Action {
  const changes: Partial<Task> = {};
  const fields = taskFields({ ...draft, title: draft.title.trim() });
  const before = taskFields(original);
  for (const key of new Set([
    ...Object.keys(before),
    ...Object.keys(fields),
  ]) as Set<keyof Task>) {
    if (
      key !== "id" &&
      JSON.stringify(before[key]) !== JSON.stringify(fields[key])
    )
      Object.assign(changes, { [key]: fields[key] });
  }
  const template = state.tasks.find((t) => t.id === draft.taskId);
  if (!template) return { type: "save", task: fields };
  if (!original.context || scope === "occurrence") {
    if (original.parentId && !draft.parentId) {
      return {
        type: "batch",
        actions: [
          {
            type: "patch",
            ref: reference(original),
            changes: Object.fromEntries(
              Object.entries(changes).filter(
                ([key]) =>
                  !["parentId", "projectId", "sectionId"].includes(key),
              ),
            ),
          },
          {
            type: "moveTask",
            task: original,
            parentRef: null,
            projectId: draft.projectId,
            sectionId: draft.sectionId,
          },
        ],
      };
    }
    return { type: "patch", ref: reference(original), changes };
  }
  const root = state.tasks.find(
    (t) => t.id === original.context!.recurrenceRootTaskId,
  )!;
  const anchor = root.schedule?.date ?? root.deadline?.date;
  const offset = anchor
    ? daysBetween(anchor, original.context.occurrenceDate)
    : 0;
  if ("schedule" in changes)
    changes.schedule = shiftDate(changes.schedule, -offset);
  if ("deadline" in changes)
    changes.deadline = shiftDate(changes.deadline, -offset);
  if (template.recurrence && "recurrence" in changes && !changes.recurrence) {
    let next = state;
    const dates = [
      ...new Set(
        Object.values(state.exceptions)
          .filter((e) => e.context?.recurrenceRootTaskId === template.id)
          .map((e) => e.context!.occurrenceDate),
      ),
    ];
    for (const date of dates) {
      const task = resolveOccurrence(next, {
        taskId: template.id,
        context: { recurrenceRootTaskId: template.id, occurrenceDate: date },
      });
      if (task)
        next = materializeSubtree(
          next,
          task,
          task.projectId,
          task.sectionId,
          makeId,
        ).state;
    }
    next = {
      ...next,
      exceptions: Object.fromEntries(
        Object.entries(next.exceptions).filter(
          ([, e]) => e.context?.recurrenceRootTaskId !== template.id,
        ),
      ),
    };
    next = reducer(next, {
      type: "patch",
      ref: { taskId: template.id },
      changes,
    });
    return { type: "replace", state: next };
  }
  return { type: "patch", ref: { taskId: template.id }, changes };
}
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
    if (entry.isNew && entry.parentRef?.context && !draft.recurrence) {
      const parent = resolveOccurrence(next, entry.parentRef);
      if (!parent) continue;
      next = reducer(next, {
        type: "save",
        task: {
          ...taskFields(draft),
          parentId: null,
          projectId: parent.projectId,
          sectionId: parent.sectionId,
        },
      });
      next = {
        ...next,
        exceptions: {
          ...next.exceptions,
          [draft.id]: {
            taskId: draft.taskId,
            parentRef: entry.parentRef,
            overrides: {},
          },
        },
      };
    } else
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
