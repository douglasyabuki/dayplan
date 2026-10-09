import { dateKey } from "./dates";
import {
  normalizeTask,
  reopenAncestors,
  taskIndex,
  validateHierarchy,
} from "./hierarchy";
import {
  asOccurrence,
  expandTasks,
  occurrenceParent,
  recurrenceRoot,
  reference,
  referenceKey,
  resolveOccurrence,
  sameContext,
} from "./recurrence";
import { deleteTag, moveTag, saveTag, tagIndex } from "./tags";
import {
  containerKey,
  type Occurrence,
  type Project,
  type Section,
  type Tag,
  type Task,
  type TaskLayout,
  type TaskReference,
  type Workspace,
} from "./types";

export type Action =
  | { type: "replace"; state: Workspace }
  | { type: "batch"; actions: Action[] }
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
  | { type: "entity"; kind: "projects"; entity: Project }
  | { type: "entity"; kind: "tags"; entity: Tag }
  | { type: "moveTag"; id: string; parentId: string | null; beforeId?: string }
  | { type: "deleteEntity"; kind: "projects" | "tags"; id: string }
  | { type: "reorder"; ids: string[] }
  | { type: "theme"; theme: Workspace["theme"] }
  | { type: "section"; section: Section }
  | { type: "moveSection"; id: string; projectId: string | null }
  | {
      type: "deleteSection";
      id: string;
      destination: string | null;
      deleteTasks: boolean;
    }
  | { type: "reorderSections"; projectId: string | null; ids: string[] }
  | { type: "layout"; projectId: string | null; layout: TaskLayout }
  | { type: "viewLayout"; view: string; layout: TaskLayout }
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

export function patchReference(
  state: Workspace,
  ref: TaskReference,
  changes: Partial<Task>,
): Workspace {
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

function contextSubtree(state: Workspace, task: Occurrence) {
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

export function completeTask(
  state: Workspace,
  ref: TaskReference,
  completed: boolean,
  today: string,
): Workspace {
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

/** Detach only this context; independent recurrence roots are never copied. */
export function materializeSubtree(
  state: Workspace,
  task: Occurrence,
  projectId: string | null,
  sectionId: string | null,
  makeId = () => crypto.randomUUID(),
): { state: Workspace; root: Task } {
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

function move(
  state: Workspace,
  action: Extract<Action, { type: "moveTask" }>,
): Workspace {
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

export function reducer(state: Workspace, action: Action): Workspace {
  switch (action.type) {
    case "replace":
      return action.state;
    case "batch":
      return action.actions.reduce(reducer, state);
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
        return reducer(state, {
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
    case "section": {
      const section = { ...action.section, name: action.section.name.trim() };
      if (
        !section.name ||
        (section.projectId &&
          !state.projects.some((p) => p.id === section.projectId))
      )
        return state;
      return {
        ...state,
        sections: state.sections.some((s) => s.id === section.id)
          ? state.sections.map((s) => (s.id === section.id ? section : s))
          : [...state.sections, section],
      };
    }
    case "moveSection": {
      const section = state.sections.find((s) => s.id === action.id);
      if (
        !section ||
        section.projectId === action.projectId ||
        (action.projectId &&
          !state.projects.some((p) => p.id === action.projectId))
      )
        return state;
      const order =
        Math.max(
          -1,
          ...state.sections
            .filter((s) => s.projectId === action.projectId)
            .map((s) => s.order),
        ) + 1;
      const next: Workspace = {
        ...state,
        sections: state.sections.map((s) =>
          s.id === action.id ? { ...s, projectId: action.projectId, order } : s,
        ),
      };
      const roots = state.tasks.filter(
        (task) => !task.parentId && task.sectionId === action.id,
      );
      let moved = roots.reduce(
        (workspace, task) =>
          patchReference(
            workspace,
            { taskId: task.id },
            {
              projectId: action.projectId,
              sectionId: action.id,
            },
          ),
        next,
      );
      const rootIds = new Set(roots.map((task) => task.id));
      moved = {
        ...moved,
        exceptions: Object.fromEntries(
          Object.entries(moved.exceptions).map(([key, exception]) => {
            if (!rootIds.has(exception.taskId)) return [key, exception];
            const overrides = { ...exception.overrides };
            if ("projectId" in overrides)
              overrides.projectId = action.projectId;
            return [key, { ...exception, overrides }];
          }),
        ),
      };
      return moved;
    }
    case "deleteSection": {
      const section = state.sections.find((s) => s.id === action.id);
      if (
        !section ||
        (action.destination &&
          !state.sections.some(
            (s) =>
              s.id === action.destination &&
              s.id !== action.id &&
              s.projectId === section.projectId,
          ))
      )
        return state;
      let next = state;
      for (const task of state.tasks.filter(
        (t) => !t.parentId && t.sectionId === action.id,
      ))
        next = action.deleteTasks
          ? reducer(next, { type: "delete", id: task.id })
          : patchReference(
              next,
              { taskId: task.id },
              { sectionId: action.destination },
            );
      return {
        ...next,
        sections: next.sections.filter((s) => s.id !== action.id),
        exceptions: Object.fromEntries(
          Object.entries(next.exceptions).map(([key, e]) => [
            key,
            e.overrides.sectionId === action.id
              ? {
                  ...e,
                  overrides: { ...e.overrides, sectionId: action.destination },
                  deleted: action.deleteTasks || e.deleted,
                }
              : e,
          ]),
        ),
      };
    }
    case "reorderSections":
      return {
        ...state,
        sections: state.sections.map((s) =>
          s.projectId === action.projectId && action.ids.includes(s.id)
            ? { ...s, order: action.ids.indexOf(s.id) }
            : s,
        ),
      };
    case "layout":
      return {
        ...state,
        layouts: {
          ...state.layouts,
          [containerKey(action.projectId)]: action.layout,
        },
      };
    case "viewLayout":
      return {
        ...state,
        layouts: { ...state.layouts, [`view:${action.view}`]: action.layout },
      };
    case "theme":
      return { ...state, theme: action.theme };
    case "moveTag":
      return moveTag(state, action.id, action.parentId, action.beforeId);
    case "entity":
      if (action.kind === "tags") return saveTag(state, action.entity);
      return {
        ...state,
        [action.kind]: state[action.kind].some((e) => e.id === action.entity.id)
          ? state[action.kind].map((e) =>
              e.id === action.entity.id ? action.entity : e,
            )
          : [...state[action.kind], action.entity],
      };
    case "deleteEntity": {
      if (action.kind === "tags") return deleteTag(state, action.id);
      const update = (task: Partial<Task>) =>
        action.kind === "projects"
          ? task.projectId === action.id
            ? { ...task, projectId: null, sectionId: null }
            : task
          : {
              ...task,
              ...(task.tagIds
                ? { tagIds: task.tagIds.filter((id) => id !== action.id) }
                : {}),
            };
      return {
        ...state,
        [action.kind]: state[action.kind].filter((e) => e.id !== action.id),
        tasks: state.tasks.map((t) => update(t) as Task),
        exceptions: Object.fromEntries(
          Object.entries(state.exceptions).map(([key, e]) => [
            key,
            { ...e, overrides: update(e.overrides) },
          ]),
        ),
        sections:
          action.kind === "projects"
            ? state.sections.filter((s) => s.projectId !== action.id)
            : state.sections,
      };
    }
  }
}

export const STORAGE_KEY = "dayplan.workspace.v2";
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function validDate(value: unknown, schedule = false): boolean {
  if (value === undefined) return true;
  if (
    !isRecord(value) ||
    typeof value.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.date)
  )
    return false;
  const date = new Date(`${value.date}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value.date &&
    (value.time === undefined ||
      (typeof value.time === "string" &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(value.time))) &&
    (!schedule ||
      (typeof value.duration === "number" &&
        Number.isFinite(value.duration) &&
        value.duration >= 15 &&
        value.duration <= 1440))
  );
}
function validTask(value: unknown): value is Task {
  if (!isRecord(value)) return false;
  const task = value as Task;
  const rule = task.recurrence;
  return (
    typeof task.id === "string" &&
    (task.parentId === null || typeof task.parentId === "string") &&
    typeof task.title === "string" &&
    typeof task.description === "string" &&
    (task.projectId === null || typeof task.projectId === "string") &&
    (task.sectionId === null || typeof task.sectionId === "string") &&
    ["none", "low", "medium", "high"].includes(task.priority) &&
    Array.isArray(task.tagIds) &&
    task.tagIds.every((id) => typeof id === "string") &&
    typeof task.completed === "boolean" &&
    typeof task.archived === "boolean" &&
    Number.isFinite(task.order) &&
    typeof task.createdAt === "string" &&
    validDate(task.deadline) &&
    validDate(task.schedule, true) &&
    (!rule ||
      (isRecord(rule) &&
        ["daily", "weekdays", "weekly", "monthly"].includes(rule.frequency) &&
        Array.isArray(rule.weekdays) &&
        rule.weekdays.every(
          (day) => Number.isInteger(day) && day >= 0 && day <= 6,
        ) &&
        (rule.frequency !== "weekdays" || rule.weekdays.length > 0) &&
        !!(task.schedule || task.deadline) &&
        (!rule.until || validDate({ date: rule.until }))))
  );
}
export function readWorkspace(): Workspace | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const state = JSON.parse(raw) as Workspace;
  const entity = (e: unknown) =>
    isRecord(e) &&
    typeof e.id === "string" &&
    typeof e.name === "string" &&
    typeof e.color === "string";
  if (
    !isRecord(state) ||
    state.version !== 2 ||
    !Array.isArray(state.tasks) ||
    !state.tasks.every(validTask) ||
    !Array.isArray(state.sections) ||
    !Array.isArray(state.projects) ||
    !state.projects.every(entity) ||
    !Array.isArray(state.tags) ||
    !state.tags.every(entity) ||
    !isRecord(state.exceptions) ||
    !isRecord(state.layouts) ||
    !Object.values(state.layouts).every((l) => l === "list" || l === "board") ||
    typeof state.timezone !== "string" ||
    !["system", "light", "dark"].includes(state.theme)
  )
    throw new Error(
      "The saved workspace could not be read. Your stored data has not been changed.",
    );
  state.tags = state.tags.map((tag, order) => ({
    ...tag,
    parentId: tag.parentId === undefined ? null : tag.parentId,
    order: tag.order === undefined ? order : tag.order,
  }));
  tagIndex(state.tags);
  validateHierarchy(state.tasks);
  new Intl.DateTimeFormat("en-US", { timeZone: state.timezone });
  for (const section of state.sections)
    if (
      !isRecord(section) ||
      typeof section.id !== "string" ||
      typeof section.name !== "string" ||
      !Number.isFinite(section.order) ||
      (section.projectId !== null &&
        !state.projects.some((p) => p.id === section.projectId))
    )
      throw new Error("Invalid section.");
  for (const task of state.tasks)
    if (
      (task.projectId !== null &&
        !state.projects.some((p) => p.id === task.projectId)) ||
      (task.sectionId !== null &&
        !state.sections.some(
          (s) => s.id === task.sectionId && s.projectId === task.projectId,
        ))
    )
      throw new Error("Invalid task location.");
  for (const [key, e] of Object.entries(state.exceptions)) {
    if (
      !isRecord(e) ||
      referenceKey(e) !== key ||
      !isRecord(e.overrides) ||
      (e.deleted !== undefined && typeof e.deleted !== "boolean") ||
      !state.tasks.some((t) => t.id === e.taskId) ||
      (e.context &&
        (!isRecord(e.context) ||
          !validDate({ date: e.context.occurrenceDate }) ||
          !state.tasks.some(
            (t) => t.id === e.context!.recurrenceRootTaskId && t.recurrence,
          )))
    )
      throw new Error("Invalid occurrence exception.");
    if (
      e.cleared &&
      (!Array.isArray(e.cleared) ||
        !e.cleared.every((k) =>
          ["schedule", "deadline", "recurrence"].includes(k),
        ))
    )
      throw new Error("Invalid cleared occurrence fields.");
    const combined = {
      ...state.tasks.find((t) => t.id === e.taskId)!,
      ...e.overrides,
    };
    for (const key of e.cleared ?? [])
      delete (combined as unknown as Record<string, unknown>)[key];
    if (!validTask(combined)) throw new Error("Invalid occurrence fields.");
    if (
      !e.deleted &&
      e.parentRef &&
      (!isRecord(e.parentRef) ||
        !state.tasks.some((t) => t.id === e.parentRef!.taskId) ||
        !resolveOccurrence(state, e.parentRef))
    )
      throw new Error("Invalid occurrence parent.");
  }
  return state;
}
export function writeWorkspace(state: Workspace) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
