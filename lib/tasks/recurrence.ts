import { addDays, daysBetween, parseDay, shiftDate } from "@/lib/dates";
import type {
  Occurrence,
  OccurrenceContext,
  Task,
  TaskReference,
} from "@/types-and-constants/tasks";
import type { Workspace } from "@/types-and-constants/workspace";

import { taskIndex } from "./hierarchy";

/**
 * Creates a stable string key for a task reference.
 * @param ref Task identity with optional recurrence occurrence context.
 * @returns {string} `JSON.stringify([taskId])` for a task without context, or `JSON.stringify([taskId, recurrenceRootTaskId, occurrenceDate])` for a contextual occurrence.
 * @example `referenceKey({ taskId: "task-1" })` returns a stable key for that task.
 */
export function referenceKey(ref: TaskReference): string {
  return JSON.stringify(
    ref.context
      ? [
          ref.taskId,
          ref.context.recurrenceRootTaskId,
          ref.context.occurrenceDate,
        ]
      : [ref.taskId],
  );
}

/**
 * Parses a serialized task reference key when it matches the supported shape.
 * @param key Serialized reference key.
 * @returns {TaskReference | undefined} `{ taskId }` for a valid one-element string array, `{ taskId, context: { recurrenceRootTaskId, occurrenceDate } }` for a valid three-string array with a date-shaped final value, or `undefined` for any other value or invalid JSON.
 * @example `parseReference('["task-1"]')` returns `{ taskId: "task-1" }`.
 */
export function parseReference(key: string): TaskReference | undefined {
  try {
    const parts: unknown = JSON.parse(key);
    if (!Array.isArray(parts) || !parts.every((p) => typeof p === "string"))
      return;
    if (parts.length === 1) return { taskId: parts[0] };
    if (parts.length === 3 && /^\d{4}-\d{2}-\d{2}$/.test(parts[2]))
      return {
        taskId: parts[0],
        context: { recurrenceRootTaskId: parts[1], occurrenceDate: parts[2] },
      };
  } catch {
    return;
  }
}

/**
 * Converts a task occurrence into its task reference.
 * @param task Task occurrence to reference.
 * @returns {TaskReference} `{ taskId: task.taskId }` when the occurrence has no context, or `{ taskId: task.taskId, context: task.context }` when it does.
 * @example `reference(occurrence)` returns the reference used to resolve that occurrence.
 */
export function reference(task: Occurrence): TaskReference {
  return {
    taskId: task.taskId,
    ...(task.context ? { context: task.context } : {}),
  };
}

/**
 * Finds the nearest recurring task in a task's ancestor chain.
 * @param state Workspace task data.
 * @param taskId Task ID to inspect.
 * @returns {Task | undefined} The first `Task` with a recurrence rule in `[task, ...ancestors]`, or `undefined` when none exists or `taskId` is absent.
 * @example `recurrenceRoot(state, "child")` returns the recurring parent of `child`.
 */
export function recurrenceRoot(
  state: Pick<Workspace, "tasks">,
  taskId: string,
): Task | undefined {
  const index = taskIndex(state.tasks),
    task = index.byId.get(taskId);
  return [task, ...index.ancestors(taskId)].find((t) => t?.recurrence);
}

/**
 * Wraps a non-recurring task as an occurrence without changing its fields.
 * @param task Task template to convert.
 * @returns {Occurrence} A shallow copy of `task` with `taskId` set to `task.id` and `id` set to `referenceKey({ taskId: task.id })`; all other task fields are preserved.
 * @example `asOccurrence(task)` creates the ordinary occurrence for a standalone task.
 */
export function asOccurrence(task: Task): Occurrence {
  return { ...task, id: referenceKey({ taskId: task.id }), taskId: task.id };
}

/**
 * Creates a task occurrence shifted to a recurrence date.
 * @param task Task template to instantiate.
 * @param date Occurrence date key.
 * @param root Recurrence root that defines the occurrence context; defaults to `task`.
 * @returns {Occurrence} A shallow copy of `task` with occurrence `id`, `taskId`, and `{ recurrenceRootTaskId, occurrenceDate }` context; schedule and deadline dates shifted by the anchor-to-date offset; and `completed: false`.
 * @example `occurrenceOn(task, "2026-10-02")` creates the task occurrence for that date.
 */
export function occurrenceOn(
  task: Task,
  date: string,
  root: Task = task,
): Occurrence {
  const anchor = root.schedule?.date ?? root.deadline?.date ?? date;
  const context = { recurrenceRootTaskId: root.id, occurrenceDate: date };
  return {
    ...task,
    id: referenceKey({ taskId: task.id, context }),
    taskId: task.id,
    context,
    schedule: shiftDate(task.schedule, daysBetween(anchor, date)),
    deadline: shiftDate(task.deadline, daysBetween(anchor, date)),
    completed: false,
  };
}

/**
 * Checks whether a date is included by a task's recurrence rule.
 * @param task Task whose recurrence rule and anchor date are used.
 * @param date Candidate date key.
 * @returns {boolean} `true` when `date` is on or after the recurrence anchor, not past `until`, and matches the rule's daily, selected weekday, anchor weekday, or anchor day-of-month cadence; otherwise `false`.
 * @example `isOccurrenceDate(task, "2026-10-02")` checks if the task repeats that day.
 */
export function isOccurrenceDate(task: Task, date: string) {
  const rule = task.recurrence,
    anchor = task.schedule?.date ?? task.deadline?.date;
  if (!rule || !anchor || date < anchor || (rule.until && date > rule.until))
    return false;
  const day = parseDay(date),
    first = parseDay(anchor);
  if (rule.frequency === "daily") return true;
  if (rule.frequency === "weekdays")
    return rule.weekdays.includes(day.getDay());
  if (rule.frequency === "weekly") return day.getDay() === first.getDay();
  const lastDay = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
  return day.getDate() === Math.min(first.getDate(), lastDay);
}

/**
 * Resolves a task reference into its effective occurrence and inherited state.
 * @param state Workspace task and exception data.
 * @param ref Task reference to resolve.
 * @param seen References already visited while resolving parents; used to detect cycles.
 * @returns {Occurrence | undefined} `undefined` when the task or required parent is missing, the reference context does not match the recurrence root/date, or its exception is deleted; otherwise an occurrence combining the task, shifted recurrence instance, exception overrides, cleared fields, inherited project/section, and inherited archived state.
 * @example `resolveOccurrence(state, { taskId: "task-1" })` resolves a non-recurring task.
 */
export function resolveOccurrence(
  state: Pick<Workspace, "tasks" | "exceptions">,
  ref: TaskReference,
  seen = new Set<string>(),
): Occurrence | undefined {
  const key = referenceKey(ref);
  if (seen.has(key)) return;
  seen.add(key);
  const index = taskIndex(state.tasks),
    task = index.byId.get(ref.taskId);
  if (!task) return;
  const root = recurrenceRoot(state, task.id);
  const exception = state.exceptions[key];
  if (
    ref.context &&
    (!root ||
      root.id !== ref.context.recurrenceRootTaskId ||
      (!exception && !isOccurrenceDate(root, ref.context.occurrenceDate)))
  )
    return;
  if (exception?.deleted) return;
  const instance = ref.context
    ? occurrenceOn(task, ref.context.occurrenceDate, root)
    : asOccurrence(task);
  const resolved = {
    ...instance,
    ...exception?.overrides,
    id: key,
    taskId: task.id,
    context: ref.context,
  };
  for (const field of exception?.cleared ?? [])
    delete (resolved as unknown as Record<string, unknown>)[field];
  const parent = occurrenceParent(state, resolved);
  const parentTask = parent
    ? resolveOccurrence(state, parent, seen)
    : undefined;
  if (parent && !parentTask) return;
  const inheritedLocation =
    parentTask ??
    (resolved.parentId ? index.location(resolved.parentId) : resolved);
  return {
    ...resolved,
    projectId: inheritedLocation.projectId,
    sectionId: inheritedLocation.sectionId,
    archived:
      resolved.archived ||
      !!parentTask?.archived ||
      (resolved.parentId
        ? index.ancestors(task.id).some((t) => t.archived)
        : false),
  };
}

/**
 * Finds the occurrence parent for a task while respecting recurrence boundaries.
 * @param state Workspace task and exception data.
 * @param task Task occurrence whose parent to resolve.
 * @returns {TaskReference | null} The exception's `parentRef` when explicitly present; otherwise a `{ taskId, context? }` reference to the eligible parent, or `null` for root tasks and independent recurrence roots.
 * @example `occurrenceParent(state, child)` returns the parent reference for a recurring child.
 */
export function occurrenceParent(
  state: Pick<Workspace, "tasks" | "exceptions">,
  task: Occurrence,
): TaskReference | null {
  const override = state.exceptions[task.id];
  if (override && "parentRef" in override) return override.parentRef ?? null;
  if (!task.parentId) return null;
  const parentRoot = recurrenceRoot(state, task.parentId);
  if (task.context)
    return parentRoot?.id === task.context.recurrenceRootTaskId
      ? { taskId: task.parentId, context: task.context }
      : null;
  return parentRoot ? null : { taskId: task.parentId };
}
const expansionCache = new WeakMap<
  Workspace["tasks"],
  WeakMap<
    Workspace["exceptions"],
    { from: string; to: string; result: Occurrence[] }
  >
>();

/**
 * Expands task templates and exceptions into occurrences across a date range.
 * @param state Workspace task and exception data.
 * @param from First date key to include.
 * @param to Last date key to include.
 * @returns {Occurrence[]} Resolved ordinary tasks, recurrence occurrences needed to cover `[from, to]`, and resolvable exception occurrences. For the same task and exception array identities and range, returns the cached array instance.
 * @example `expandTasks(state, "2026-10-01", "2026-10-07")` returns occurrences in that week.
 */
export function expandTasks(
  state: Pick<Workspace, "tasks" | "exceptions">,
  from: string,
  to: string,
): Occurrence[] {
  let exceptions = expansionCache.get(state.tasks);
  if (!exceptions)
    expansionCache.set(state.tasks, (exceptions = new WeakMap()));
  const cached = exceptions.get(state.exceptions);
  if (cached?.from === from && cached.to === to) return cached.result;
  const result = new Map<string, Occurrence>();
  for (const task of state.tasks) {
    const root = recurrenceRoot(state, task.id);
    if (!root) {
      const resolved = resolveOccurrence(state, { taskId: task.id });
      if (resolved) result.set(resolved.id, resolved);
      continue;
    }
    const anchor = root.schedule?.date ?? root.deadline?.date;
    if (!anchor) continue;
    const offsets = [task.schedule?.date, task.deadline?.date]
      .filter((d): d is string => !!d)
      .map((d) => daysBetween(anchor, d));
    const start = [anchor, addDays(from, -Math.max(0, ...offsets))]
      .sort()
      .at(-1)!;
    const end = addDays(to, -Math.min(0, ...offsets));
    for (let date = start; date <= end; date = addDays(date, 1)) {
      if (!isOccurrenceDate(root, date)) continue;
      const resolved = resolveOccurrence(state, {
        taskId: task.id,
        context: { recurrenceRootTaskId: root.id, occurrenceDate: date },
      });
      if (resolved) result.set(resolved.id, resolved);
    }
  }
  for (const exception of Object.values(state.exceptions)) {
    const resolved = resolveOccurrence(state, exception);
    if (resolved) result.set(resolved.id, resolved);
  }
  const expanded = [...result.values()];
  exceptions.set(state.exceptions, { from, to, result: expanded });
  return expanded;
}

/**
 * Returns the direct occurrence children of a parent in display order.
 * @param state Workspace task and exception data.
 * @param parent Parent occurrence.
 * @param all Candidate occurrences to search.
 * @returns {Occurrence[]} Occurrences whose `occurrenceParent` reference matches `parent.id`, sorted by ascending `order` and then ascending `id`; returns `[]` when there are no matches.
 * @example `occurrenceChildren(state, parent, occurrences)` returns its visible direct children.
 */
export function occurrenceChildren(
  state: Pick<Workspace, "tasks" | "exceptions">,
  parent: Occurrence,
  all: Occurrence[],
) {
  return all
    .filter((t) => {
      const ref = occurrenceParent(state, t);
      return ref && referenceKey(ref) === parent.id;
    })
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/**
 * Compares two optional recurrence contexts by their serialized values.
 * @param a First recurrence context.
 * @param b Second recurrence context.
 * @returns {boolean} The result of comparing `JSON.stringify(a)` and `JSON.stringify(b)`; therefore two undefined contexts compare equal.
 * @example `sameContext(undefined, undefined)` returns `true`.
 */
export function sameContext(a?: OccurrenceContext, b?: OccurrenceContext) {
  return JSON.stringify(a) === JSON.stringify(b);
}
