import { dateKey } from "@/lib/dates";
import {
  normalizeTask,
  reopenAncestors,
  taskIndex,
  validateHierarchy,
} from "@/lib/tasks/hierarchy";
import {
  asOccurrence,
  expandTasks,
  occurrenceParent,
  recurrenceRoot,
  reference,
  referenceKey,
  resolveOccurrence,
  sameContext,
} from "@/lib/tasks/recurrence";
import {
  type Occurrence,
  type Task,
  type TaskReference,
} from "@/types-and-constants/tasks";
import { type Workspace } from "@/types-and-constants/workspace";

type TaskState = Pick<Workspace, "tasks" | "sections" | "exceptions">;

export type TaskMutation =
  | { type: "save"; task: Task }
  | {
      type: "patch";
      ref: TaskReference;
      changes: Partial<Task>;
      series?: boolean;
    }
  | { type: "occurrence"; task: Occurrence; deleted?: boolean }
  | { type: "complete"; ref: TaskReference; completed: boolean; today: string }
  | { type: "delete"; id: string }
  | { type: "deleteOccurrence"; ref: TaskReference }
  | { type: "archive"; id: string; archived: boolean }
  | { type: "reorder"; ids: string[] }
  | {
      type: "moveTask";
      task: Occurrence;
      parentRef?: TaskReference | null;
      projectId?: string | null;
      sectionId: string | null;
      tasks?: Occurrence[];
      beforeId?: string;
    }
  | { type: "reorderTasks"; tasks: Occurrence[]; ids: string[] };

/**
 * Applies task field changes to a template or to one recurrence exception.
 * @param state Current task state.
 * @param ref Task reference to patch.
 * @param changes Fields to apply; `undefined` clears an exception override.
 * @returns {T} The same state object when `ref.taskId` is missing; otherwise a shallow state copy with either the normalized task replaced in `tasks` (and incomplete ancestors reopened) or the occurrence exception stored at `referenceKey(ref)` with merged `overrides` and updated `cleared` fields.
 * @example `patchReference(state, { taskId: "task-1" }, { title: "Updated" })` changes the task title.
 */
export function patchReference<T extends TaskState>(
  state: T,
  ref: TaskReference,
  changes: Partial<Task>,
): T {
  const original = state.tasks.find((t) => t.id === ref.taskId);
  if (!original) return state;
  if (!ref.context) {
    const task = normalizeTask(state, {
      ...original,
      ...changes,
      id: original.id,
    });
    const tasks = state.tasks.map((t) => (t.id === task.id ? task : t));
    validateHierarchy(tasks);
    return {
      ...state,
      tasks: !task.completed ? reopenAncestors(tasks, task.id) : tasks,
    };
  }
  const key = referenceKey(ref),
    previous = state.exceptions[key];
  const overrides = { ...previous?.overrides, ...changes };
  delete overrides.id;
  const cleared = new Set(previous?.cleared ?? []);
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) cleared.add(key as keyof Task);
    else cleared.delete(key as keyof Task);
  }
  return {
    ...state,
    exceptions: {
      ...state.exceptions,
      [key]: { ...previous, ...ref, overrides, cleared: [...cleared] },
    },
  };
}

/**
 * Collects an occurrence and its context-inherited descendants.
 * @param state Workspace task and exception data.
 * @param task Root occurrence to traverse.
 * @returns {Occurrence[]} `task` and every resolvable descendant occurrence attached through the same recurrence context or an exception `parentRef`; each occurrence appears at most once.
 * @example `contextSubtree(state, occurrence)` returns the occurrence and its inherited child tree.
 */
function contextSubtree(
  state: Pick<Workspace, "tasks" | "exceptions">,
  task: Occurrence,
) {
  const index = taskIndex(state.tasks),
    result: Occurrence[] = [];
  const pending = [task],
    seen = new Set<string>();
  while (pending.length) {
    const current = pending.shift()!;
    if (seen.has(current.id)) continue;
    seen.add(current.id);
    result.push(current);
    const refs: TaskReference[] = (index.children.get(current.taskId) ?? [])
      .filter(
        (t) =>
          recurrenceRoot(state, t.id)?.id ===
          current.context?.recurrenceRootTaskId,
      )
      .map((t) => ({ taskId: t.id, context: current.context }));
    for (const exception of Object.values(state.exceptions)) {
      if (
        exception.parentRef &&
        referenceKey(exception.parentRef) === current.id
      )
        refs.push(exception);
    }
    for (const ref of refs) {
      const child = resolveOccurrence(state, ref);
      const parent = child && occurrenceParent(state, child);
      if (child && parent && referenceKey(parent) === current.id)
        pending.push(child);
    }
  }
  return result;
}

/**
 * Completes a task subtree or reopens the task and its occurrence ancestors.
 * @param state Current task state.
 * @param ref Task occurrence reference to update.
 * @param completed Desired completion state.
 * @param today Current date key used when resolving recurrence candidates.
 * @returns {T} The original state when `ref` cannot be resolved; otherwise updated state. With `completed: false`, the referenced occurrence and each resolvable occurrence ancestor are patched to `completed: false`. With `completed: true`, the occurrence context subtree is completed and eligible template descendants are completed when their due, schedule, or occurrence date is on or before the cutoff (`ref.context.occurrenceDate` or `today`).
 * @example `completeTask(state, ref, true, "2026-10-01")` completes the occurrence and its eligible descendants.
 */
export function completeTask<T extends TaskState>(
  state: T,
  ref: TaskReference,
  completed: boolean,
  today: string,
): T {
  const task = resolveOccurrence(state, ref);
  if (!task) return state;
  let next = state;
  if (!completed) {
    let current: Occurrence | undefined = task;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      next = patchReference(next, reference(current), { completed: false });
      const parent = occurrenceParent(next, current);
      current = parent ? resolveOccurrence(next, parent) : undefined;
    }
    return next;
  }
  const index = taskIndex(state.tasks),
    ids = new Set([
      task.taskId,
      ...index.descendants(task.taskId).map((t) => t.id),
    ]);
  const cutoff = task.context?.occurrenceDate ?? today;
  const anchors = state.tasks
    .filter((t) => ids.has(t.id))
    .map((t) => t.schedule?.date ?? t.deadline?.date ?? cutoff);
  const subtree = contextSubtree(state, task);
  const inheritedIds = new Set(subtree.map((t) => t.id));
  for (const t of subtree) ids.add(t.taskId);
  const candidates = expandTasks(state, [cutoff, ...anchors].sort()[0], cutoff);
  for (const item of [...subtree, ...candidates]) {
    if (!ids.has(item.taskId)) continue;
    const inherited = inheritedIds.has(item.id);
    const due =
      item.deadline?.date ??
      item.schedule?.date ??
      item.context?.occurrenceDate;
    if (
      inherited ||
      (item.context?.recurrenceRootTaskId !==
        task.context?.recurrenceRootTaskId &&
        (!due || due <= cutoff))
    )
      next = patchReference(next, reference(item), { completed: true });
  }
  return next;
}

/**
 * Copies an occurrence subtree into ordinary tasks and marks its source context deleted.
 * @param state Current task state.
 * @param task Occurrence subtree root to detach.
 * @param projectId Project for the new root task, or `null` for the inbox.
 * @param sectionId Section for the new root task.
 * @param makeId ID generator used for each copied task.
 * @returns {{ state: T; root: Task }} `state` has ordinary task copies appended and source-context exceptions marked deleted; `root` is the copied root task with the supplied project and section. Each copied task receives a generated ID and has recurrence cleared.
 * @example `materializeSubtree(state, occurrence, null, null)` detaches that occurrence into inbox tasks.
 */
export function materializeSubtree<T extends TaskState>(
  state: T,
  task: Occurrence,
  projectId: string | null,
  sectionId: string | null,
  makeId = () => crypto.randomUUID(),
): { state: T; root: Task } {
  const members = contextSubtree(state, task),
    ids = new Map(members.map((t) => [t.taskId, makeId()]));
  const tasks = members.map((t) => {
    const parent = occurrenceParent(state, t);
    const { taskId: _taskId, context: _context, ...fields } = t;
    void _taskId;
    void _context;
    const root = t.taskId === task.taskId;
    return {
      ...fields,
      id: ids.get(t.taskId)!,
      parentId: root ? null : (ids.get(parent?.taskId ?? "") ?? null),
      projectId: root ? projectId : null,
      sectionId: root ? sectionId : null,
      recurrence: undefined,
    };
  });
  const exceptions = { ...state.exceptions };
  for (const member of members)
    exceptions[member.id] = {
      ...exceptions[member.id],
      ...reference(member),
      overrides: exceptions[member.id]?.overrides ?? {},
      deleted: true,
    };
  return {
    state: { ...state, tasks: [...state.tasks, ...tasks], exceptions },
    root: tasks.find((t) => t.id === ids.get(task.taskId))!,
  };
}

/**
 * Moves a task occurrence, materializing it when a recurrence context must be detached.
 * @param state Current task state.
 * @param action Move details including parent, location, and insertion point.
 * @returns {T} The original state object when the task, requested parent, or hierarchy move is invalid; otherwise state with the occurrence moved, siblings reordered, and any required recurrence context materialized.
 * @example `move(state, { type: "moveTask", task, sectionId: null, projectId: null })` moves a task to the inbox.
 */
function move<T extends TaskState>(
  state: T,
  action: Extract<TaskMutation, { type: "moveTask" }>,
): T {
  let task = resolveOccurrence(state, reference(action.task));
  if (!task) return state;
  const parent = action.parentRef
    ? resolveOccurrence(state, action.parentRef)
    : undefined;
  if (action.parentRef && !parent) return state;
  let ancestor = parent;
  const seenParents = new Set<string>();
  while (ancestor && !seenParents.has(ancestor.id)) {
    if (ancestor.taskId === task.taskId) return state;
    seenParents.add(ancestor.id);
    const ref = occurrenceParent(state, ancestor);
    ancestor = ref ? resolveOccurrence(state, ref) : undefined;
  }
  const index = taskIndex(state.tasks);
  if (
    parent &&
    (parent.taskId === task.taskId ||
      index.ancestors(parent.taskId).some((t) => t.id === task!.taskId))
  )
    return state;
  const projectId = parent
    ? parent.projectId
    : action.projectId === undefined
      ? task.projectId
      : action.projectId;
  const sectionId = parent ? parent.sectionId : action.sectionId;
  let next = state;
  const oldParent = occurrenceParent(state, task);
  const parentChanged =
    JSON.stringify(oldParent) !== JSON.stringify(action.parentRef ?? null);
  if (task.context && parentChanged) {
    const materialized = materializeSubtree(next, task, projectId, sectionId);
    next = materialized.state;
    task = asOccurrence(materialized.root);
  }
  if (parent?.context && !sameContext(parent.context, task.context)) {
    // A one-off child of a virtual parent is an ordinary task with an occurrence placement.
    next = patchReference(next, reference(task), {
      parentId: null,
      projectId,
      sectionId,
    });
    next = {
      ...next,
      exceptions: {
        ...next.exceptions,
        [task.id]: {
          ...reference(task),
          overrides: {},
          parentRef: reference(parent),
        },
      },
    };
  } else {
    next = patchReference(next, reference(task), {
      parentId: parent?.taskId ?? null,
      projectId: parent ? null : projectId,
      sectionId: parent ? null : sectionId,
    });
    if (next.exceptions[task.id]?.parentRef !== undefined)
      next = {
        ...next,
        exceptions: {
          ...next.exceptions,
          [task.id]: {
            ...next.exceptions[task.id],
            parentRef: parent ? reference(parent) : null,
          },
        },
      };
  }
  const all = action.tasks
    ? action.tasks
        .map((t) => resolveOccurrence(next, reference(t)))
        .filter((t): t is Occurrence => !!t)
    : expandTasks(
        next,
        task.context?.occurrenceDate ?? dateKey(),
        task.context?.occurrenceDate ?? dateKey(),
      );
  const siblings = all
    .filter((t) => {
      const p = occurrenceParent(next, t);
      return (
        t.id !== task!.id &&
        (parent
          ? !!p && referenceKey(p) === parent.id
          : !p &&
            !t.parentId &&
            t.projectId === projectId &&
            t.sectionId === sectionId)
      );
    })
    .sort((a, b) => a.order - b.order);
  const before = siblings.findIndex((t) => t.id === action.beforeId);
  siblings.splice(before < 0 ? siblings.length : before, 0, task);
  for (let i = 0; i < siblings.length; i++)
    next = patchReference(next, reference(siblings[i]), { order: i });
  if (parent && !task.completed)
    next = completeTask(next, reference(parent), false, dateKey());
  return next;
}

/**
 * Applies one task mutation to workspace task state.
 * @param state Current task state.
 * @param action Mutation describing the task operation.
 * @returns {T} State after applying the selected `TaskMutation` case (`save`, `patch`, `occurrence`, `complete`, `delete`, `deleteOccurrence`, `archive`, `moveTask`, `reorder`, or `reorderTasks`). Branches that detect missing or invalid inputs may return the original state object; other cases return a shallow state copy or a patched state.
 * @example `applyTaskMutation(state, { type: "archive", id: "task-1", archived: true })` archives a task.
 */
export function applyTaskMutation<T extends TaskState>(
  state: T,
  action: TaskMutation,
): T {
  switch (action.type) {
    case "patch":
      return patchReference(state, action.ref, action.changes);

    case "complete":
      return completeTask(state, action.ref, action.completed, action.today);

    case "save": {
      const task = normalizeTask(state, action.task);
      const tasks = state.tasks.some((t) => t.id === task.id)
        ? state.tasks.map((t) => (t.id === task.id ? task : t))
        : [...state.tasks, task];
      validateHierarchy(tasks);
      return {
        ...state,
        tasks: !task.completed ? reopenAncestors(tasks, task.id) : tasks,
      };
    }

    case "occurrence": {
      if (action.deleted)
        return applyTaskMutation(state, {
          type: "deleteOccurrence",
          ref: reference(action.task),
        });
      const original = resolveOccurrence(state, reference(action.task));
      if (!original) return state;
      const changes: Partial<Task> = {};
      for (const key of Object.keys(
        state.tasks.find((t) => t.id === action.task.taskId)!,
      ) as (keyof Task)[]) {
        if (
          key !== "id" &&
          JSON.stringify(original[key]) !== JSON.stringify(action.task[key])
        )
          Object.assign(changes, { [key]: action.task[key] });
      }
      return patchReference(state, reference(action.task), changes);
    }

    case "deleteOccurrence": {
      const task = resolveOccurrence(state, action.ref);
      if (!task) return state;
      const exceptions = { ...state.exceptions };
      for (const member of contextSubtree(state, task))
        exceptions[member.id] = {
          ...exceptions[member.id],
          ...reference(member),
          overrides: exceptions[member.id]?.overrides ?? {},
          deleted: true,
        };
      return { ...state, exceptions };
    }

    case "delete": {
      const removed = new Set([
        action.id,
        ...taskIndex(state.tasks)
          .descendants(action.id)
          .map((t) => t.id),
      ]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const e of Object.values(state.exceptions))
          if (
            e.parentRef &&
            removed.has(e.parentRef.taskId) &&
            !removed.has(e.taskId)
          ) {
            removed.add(e.taskId);
            for (const child of taskIndex(state.tasks).descendants(e.taskId))
              removed.add(child.id);
            changed = true;
          }
      }
      return {
        ...state,
        tasks: state.tasks.filter((t) => !removed.has(t.id)),
        exceptions: Object.fromEntries(
          Object.entries(state.exceptions).filter(
            ([, e]) =>
              !removed.has(e.taskId) &&
              !removed.has(e.context?.recurrenceRootTaskId ?? ""),
          ),
        ),
      };
    }

    case "archive":
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.id ? { ...t, archived: action.archived } : t,
        ),
      };

    case "moveTask":
      return move(state, action);

    case "reorder":

    case "reorderTasks": {
      const all =
        action.type === "reorderTasks"
          ? action.tasks
          : expandTasks(state, dateKey(), dateKey());
      const selected = action.ids
        .map((id) => all.find((t) => t.id === id))
        .filter((t): t is Occurrence => !!t);
      if (!selected.length) return state;
      const parent = occurrenceParent(state, selected[0]);
      if (
        selected.some(
          (t) =>
            JSON.stringify(occurrenceParent(state, t)) !==
              JSON.stringify(parent) ||
            t.projectId !== selected[0].projectId ||
            t.sectionId !== selected[0].sectionId,
        )
      )
        return state;
      const ranks = selected.map((t) => t.order).sort((a, b) => a - b);
      return selected.reduce(
        (next, t, i) => patchReference(next, reference(t), { order: ranks[i] }),
        state,
      );
    }
  }
}
