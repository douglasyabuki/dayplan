import type { Task, Workspace } from "./types";

function buildTaskIndex(tasks: Task[]) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const children = new Map<string | null, Task[]>();
  for (const task of tasks)
    children.set(task.parentId, [...(children.get(task.parentId) ?? []), task]);
  for (const list of children.values())
    list.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  function ancestors(id: string) {
    const result: Task[] = [],
      seen = new Set([id]);
    let parent = byId.get(id)?.parentId;
    while (parent) {
      if (seen.has(parent) || !byId.has(parent))
        throw new Error("Invalid task hierarchy.");
      seen.add(parent);
      const task = byId.get(parent)!;
      result.push(task);
      parent = task.parentId;
    }
    return result;
  }
  function descendants(id: string) {
    const result: Task[] = [],
      pending = [...(children.get(id) ?? [])],
      seen = new Set([id]);
    while (pending.length) {
      const task = pending.pop()!;
      if (seen.has(task.id)) throw new Error("Invalid task hierarchy.");
      seen.add(task.id);
      result.push(task);
      pending.push(...(children.get(task.id) ?? []));
    }
    return result;
  }
  function location(id: string) {
    const task = ancestors(id).at(-1) ?? byId.get(id);
    return {
      projectId: task?.projectId ?? null,
      sectionId: task?.sectionId ?? null,
    };
  }
  return { byId, children, ancestors, descendants, location };
}

export function validateHierarchy(tasks: Task[]) {
  const index = taskIndex(tasks);
  if (index.byId.size !== tasks.length)
    throw new Error("Duplicate task identity.");
  for (const task of tasks) {
    index.ancestors(task.id);
    if (task.parentId && (task.projectId !== null || task.sectionId !== null))
      throw new Error("Subtasks inherit their parent's location.");
  }
}

export function normalizeTask(state: Workspace, task: Task): Task {
  if (task.parentId) return { ...task, projectId: null, sectionId: null };
  return {
    ...task,
    sectionId: state.sections.some(
      (s) => s.id === task.sectionId && s.projectId === task.projectId,
    )
      ? task.sectionId
      : null,
  };
}

export function reopenAncestors(tasks: Task[], id: string) {
  const ids = new Set(
    taskIndex(tasks)
      .ancestors(id)
      .map((t) => t.id),
  );
  return tasks.map((t) => (ids.has(t.id) ? { ...t, completed: false } : t));
}

const indexes = new WeakMap<Task[], ReturnType<typeof buildTaskIndex>>();
/** Immutable workspace arrays make hierarchy indexes safe to reuse across selectors. */
export function taskIndex(tasks: Task[]) {
  let index = indexes.get(tasks);
  if (!index) {
    index = buildTaskIndex(tasks);
    indexes.set(tasks, index);
  }
  return index;
}
