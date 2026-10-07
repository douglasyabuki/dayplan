import { daysBetween, shiftDate } from "./dates";
import { taskIndex } from "./hierarchy";
import {
  asOccurrence,
  occurrenceChildren,
  occurrenceOn,
  occurrenceParent,
  recurrenceRoot,
  reference,
  referenceKey,
  resolveOccurrence,
} from "./recurrence";
import { type Action, materializeSubtree, reducer } from "./store";
import type { Occurrence, Task, Workspace } from "./types";

export function validateTaskDraft(draft: Task): string | undefined {
  if (!draft.title.trim()) return "Give this task a title.";
  for (const value of [draft.schedule, draft.deadline]) {
    if (!value) continue;
    const date = new Date(`${value.date}T12:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ||
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value.date
    )
      return "Choose a valid date.";
    if (value.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time))
      return "Choose a valid time.";
  }
  if (
    draft.schedule &&
    (!Number.isFinite(draft.schedule.duration) ||
      draft.schedule.duration < 15 ||
      draft.schedule.duration > 1440)
  )
    return "Duration must be between 15 and 1440 minutes.";
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
function fieldDraftAction(
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
  if (!Object.keys(changes).length) return { type: "batch", actions: [] };
  if (!original.context || scope === "occurrence") {
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

export type TaskScope = "occurrence" | "series";
export type EditableTaskFields = Pick<
  Task,
  | "title"
  | "description"
  | "priority"
  | "tagIds"
  | "deadline"
  | "schedule"
  | "recurrence"
>;
export type TaskOperation =
  | {
      kind: "edit";
      task: Occurrence;
      changes: Partial<EditableTaskFields>;
      scope: TaskScope;
    }
  | { kind: "complete"; task: Occurrence; completed: boolean; today: string }
  | { kind: "archive"; task: Occurrence; archived: boolean }
  | { kind: "delete"; task: Occurrence; scope: TaskScope }
  | {
      kind: "duplicate";
      task: Occurrence;
      tasks: Occurrence[];
      manual: boolean;
    }
  | {
      kind: "move";
      task: Occurrence;
      parentId: string | null;
      projectId: string | null;
      sectionId: string | null;
      beforeId?: string;
    };

/** Structural edits always target templates, even when initiated on an occurrence. */
export function moveTaskAction(
  state: Workspace,
  operation: Extract<TaskOperation, { kind: "move" }>,
): Action {
  const template = state.tasks.find((t) => t.id === operation.task.taskId);
  if (!template) throw new Error("This task no longer exists.");
  if (
    operation.parentId &&
    !state.tasks.some((t) => t.id === operation.parentId)
  )
    throw new Error("The parent no longer exists.");
  if (
    operation.parentId === template.id ||
    (operation.parentId &&
      taskIndex(state.tasks)
        .ancestors(operation.parentId)
        .some((t) => t.id === template.id))
  )
    throw new Error("A task cannot be moved into its own subtree.");
  const next = {
    ...template,
    parentId: operation.parentId,
    projectId: operation.parentId ? null : operation.projectId,
    sectionId: operation.parentId ? null : operation.sectionId,
  };
  const siblings = state.tasks
    .filter(
      (t) =>
        t.id !== template.id &&
        t.parentId === next.parentId &&
        (next.parentId ||
          (t.projectId === next.projectId && t.sectionId === next.sectionId)),
    )
    .sort((a, b) => a.order - b.order);
  const before = siblings.findIndex((t) => t.id === operation.beforeId);
  siblings.splice(before < 0 ? siblings.length : before, 0, next);
  // Existing occurrence placement overrides must not undo a series-level move.
  const exceptions = Object.fromEntries(
    Object.entries(state.exceptions).map(([key, e]) => {
      if (e.taskId !== template.id) return [key, e];
      const { parentRef: _parent, ...rest } = e;
      void _parent;
      const overrides = { ...rest.overrides };
      delete overrides.parentId;
      delete overrides.projectId;
      delete overrides.sectionId;
      delete overrides.order;
      return [
        key,
        {
          ...rest,
          overrides,
          cleared: rest.cleared?.filter(
            (k) => !["parentId", "projectId", "sectionId", "order"].includes(k),
          ),
        },
      ];
    }),
  );
  let result = { ...state, exceptions };
  for (const [order, sibling] of siblings.entries())
    result = reducer(result, { type: "save", task: { ...sibling, order } });
  return { type: "replace", state: result };
}

/** Shared editor and immediate-action commit path. Only changed fields are written. */
export function taskDraftAction(
  state: Workspace,
  original: Occurrence,
  draft: Occurrence,
  scope: TaskScope,
  makeId = () => crypto.randomUUID(),
): Action {
  const error = validateTaskDraft(draft);
  if (error) throw new Error(error);
  if (
    original.context &&
    scope !== "series" &&
    JSON.stringify(original.recurrence) !== JSON.stringify(draft.recurrence)
  )
    throw new Error("Select Entire series to change the repeat rule.");
  if (!state.tasks.some((t) => t.id === original.taskId))
    return fieldDraftAction(state, original, draft, scope, makeId);
  const structural = ["parentId", "projectId", "sectionId", "order"] as const;
  const relocated = structural
    .slice(0, 3)
    .some((key) => original[key] !== draft[key]);
  const reordered = original.order !== draft.order;
  const fields = {
    ...draft,
    parentId: original.parentId,
    projectId: original.projectId,
    sectionId: original.sectionId,
    order: original.order,
  };
  const action = fieldDraftAction(state, original, fields, scope, makeId);
  if (!relocated && !reordered) return action;
  let next = reducer(state, action);
  if (relocated)
    next = reducer(
      next,
      moveTaskAction(next, {
        kind: "move",
        task: original,
        parentId: draft.parentId,
        projectId: draft.projectId,
        sectionId: draft.sectionId,
      }),
    );
  if (reordered)
    next = reducer(next, {
      type: "patch",
      ref: { taskId: original.taskId },
      changes: { order: draft.order },
    });
  return { type: "replace", state: next };
}

/** Snapshot one effective subtree, including collapsed and independent repeating children. */
export function duplicateTaskAction(
  state: Workspace,
  source: Occurrence,
  all: Occurrence[],
  manual: boolean,
  makeId = () => crypto.randomUUID(),
  now = new Date().toISOString(),
): Action {
  const index = taskIndex(state.tasks);
  const members: { task: Occurrence; parent: string | null }[] = [];
  const seen = new Set<string>();
  function visit(task: Occurrence, parent: string | null) {
    if (seen.has(task.taskId)) return;
    seen.add(task.taskId);
    members.push({ task, parent });
    const children = occurrenceChildren(state, task, all);
    for (const child of index.children.get(task.taskId) ?? []) {
      if (children.some((t) => t.taskId === child.id)) continue;
      const root = recurrenceRoot(state, child.id);
      const context =
        root && root.id === task.context?.recurrenceRootTaskId
          ? task.context
          : undefined;
      if (context) {
        const resolved = resolveOccurrence(state, {
          taskId: child.id,
          context,
        });
        const parent = resolved && occurrenceParent(state, resolved);
        if (resolved && parent && referenceKey(parent) === task.id)
          children.push(resolved);
      } else {
        const date =
          task.context?.occurrenceDate ??
          task.schedule?.date ??
          task.deadline?.date ??
          now.slice(0, 10);
        const candidates = all
          .filter((t) => t.taskId === child.id)
          .sort((a, b) =>
            (a.context?.occurrenceDate ?? "").localeCompare(
              b.context?.occurrenceDate ?? "",
            ),
          );
        const effective =
          candidates
            .filter((t) => (t.context?.occurrenceDate ?? "") <= date)
            .at(-1) ?? candidates[0];
        if (effective) {
          const parent = occurrenceParent(state, effective);
          if (!parent || referenceKey(parent) === task.id)
            children.push(effective);
        } else if (root)
          children.push(
            occurrenceOn(
              child,
              root.schedule?.date ?? root.deadline!.date,
              root,
            ),
          );
        else children.push(asOccurrence(child));
      }
    }
    for (const child of children.sort((a, b) => a.order - b.order))
      visit(child, task.taskId);
  }
  visit(source, null);
  const ids = new Map(members.map(({ task }) => [task.taskId, makeId()]));
  const template = index.byId.get(source.taskId)!;
  const location = index.location(source.taskId);
  const copies: Task[] = members.map(({ task, parent }) => ({
    id: ids.get(task.taskId)!,
    parentId: parent ? ids.get(parent)! : template.parentId,
    projectId: parent || template.parentId ? null : location.projectId,
    sectionId: parent || template.parentId ? null : location.sectionId,
    title: task.title,
    description: task.description,
    priority: task.priority,
    tagIds: [...task.tagIds],
    deadline: task.deadline ? { ...task.deadline } : undefined,
    schedule: task.schedule ? { ...task.schedule } : undefined,
    completed: false,
    archived: false,
    createdAt: now,
    order: task.order,
  }));
  const siblings = state.tasks
    .filter(
      (t) =>
        t.parentId === template.parentId &&
        (template.parentId ||
          (t.projectId === template.projectId &&
            t.sectionId === template.sectionId)),
    )
    .sort((a, b) => a.order - b.order);
  copies[0].order = (siblings.at(-1)?.order ?? -1) + 1;
  const actions: Action[] = copies.map((task) => ({ type: "save", task }));
  if (manual) {
    siblings.splice(
      siblings.findIndex((t) => t.id === template.id) + 1,
      0,
      copies[0],
    );
    siblings.forEach((t, order) =>
      actions.push({
        type: "patch",
        ref: { taskId: t.id },
        changes: { order },
      }),
    );
  }
  return { type: "batch", actions };
}

export function taskOperationAction(
  state: Workspace,
  operation: TaskOperation,
): Action {
  const task = resolveOccurrence(state, reference(operation.task));
  if (!task) throw new Error("This task no longer exists.");
  switch (operation.kind) {
    case "edit":
      return taskDraftAction(
        state,
        task,
        { ...task, ...operation.changes },
        operation.scope,
      );
    case "complete":
      return {
        type: "complete",
        ref: reference(task),
        completed: operation.completed,
        today: operation.today,
      };
    case "archive":
      return { type: "archive", id: task.taskId, archived: operation.archived };
    case "delete":
      return task.context && operation.scope === "occurrence"
        ? { type: "deleteOccurrence", ref: reference(task) }
        : { type: "delete", id: task.taskId };
    case "duplicate":
      return duplicateTaskAction(
        state,
        task,
        operation.tasks,
        operation.manual,
      );
    case "move":
      return moveTaskAction(state, operation);
  }
}

/** Compatibility adapter for existing structural callers, including drag and editor ordering. */
export function taskAction(state: Workspace, action: Action): Action {
  if (action.type === "moveTask")
    return moveTaskAction(state, {
      kind: "move",
      task: action.task,
      parentId: action.parentRef?.taskId ?? null,
      projectId:
        action.projectId === undefined
          ? action.task.projectId
          : action.projectId,
      sectionId: action.sectionId,
      beforeId:
        action.tasks?.find((t) => t.id === action.beforeId)?.taskId ??
        action.beforeId,
    });
  if (action.type === "reorderTasks") {
    const ids = [
      ...new Set(
        action.ids
          .map((id) => action.tasks.find((t) => t.id === id)?.taskId)
          .filter((id): id is string => !!id),
      ),
    ];
    return {
      type: "batch",
      actions: ids.map((taskId, order) => ({
        type: "patch",
        ref: { taskId },
        changes: { order },
      })),
    };
  }
  if (action.type === "occurrence" && !action.deleted) {
    const original = resolveOccurrence(state, reference(action.task));
    if (original)
      return taskDraftAction(state, original, action.task, "occurrence");
  }
  return action;
}
