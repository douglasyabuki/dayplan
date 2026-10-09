import { addDays, daysBetween, parseDay, shiftDate } from "./dates";
import { taskIndex } from "./hierarchy";
import type {
  Occurrence,
  OccurrenceContext,
  Task,
  TaskReference,
  Workspace,
} from "./types";

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
export function reference(task: Occurrence): TaskReference {
  return {
    taskId: task.taskId,
    ...(task.context ? { context: task.context } : {}),
  };
}
export function recurrenceRoot(
  state: Workspace,
  taskId: string,
): Task | undefined {
  const index = taskIndex(state.tasks),
    task = index.byId.get(taskId);
  return [task, ...index.ancestors(taskId)].find((t) => t?.recurrence);
}
export function asOccurrence(task: Task): Occurrence {
  return { ...task, id: referenceKey({ taskId: task.id }), taskId: task.id };
}
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
export function resolveOccurrence(
  state: Workspace,
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
/** Independent recurrence roots deliberately have no occurrence parent. */
export function occurrenceParent(
  state: Workspace,
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

export function expandTasks(
  state: Workspace,
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
export function occurrenceChildren(
  state: Workspace,
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
export function sameContext(a?: OccurrenceContext, b?: OccurrenceContext) {
  return JSON.stringify(a) === JSON.stringify(b);
}
