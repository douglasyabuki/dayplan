import type { Task } from "@/types-and-constants/tasks";
import type { Workspace } from "@/types-and-constants/workspace";

/**
 * Builds lookup and traversal helpers for a task hierarchy.
 * @param tasks Tasks to index.
 * @returns {{ byId: Map<string, Task>; children: Map<string | null, Task[]>; ancestors: (id: string) => Task[]; descendants: (id: string) => Task[]; location: (id: string) => { projectId: string | null; sectionId: string | null } }} `byId` maps task IDs to tasks; `children` maps parent IDs, including `null`, to sorted child arrays; `ancestors(id)` returns nearest-first parents; `descendants(id)` returns depth-first descendants; `location(id)` returns the root project and section IDs, defaulting missing values to `null`.
 * @example `buildTaskIndex(tasks).descendants("task-1")` returns the descendants of `task-1`.
 */
function buildTaskIndex(tasks: Task[]) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const children = new Map<string | null, Task[]>();
  for (const task of tasks)
    children.set(task.parentId, [...(children.get(task.parentId) ?? []), task]);
  for (const list of children.values())
    list.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  /**
   * Lists parent tasks from the immediate parent up to the root.
   * @param id Task ID whose parents to find.
   * @returns {Task[]} Parent tasks ordered from the immediate parent to the root; returns `[]` when the task has no parent.
   * @example `ancestors("child")` returns the child's parent chain.
   */
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

  /**
   * Lists every descendant of a task.
   * @param id Parent task ID to traverse.
   * @returns {Task[]} All descendant tasks in depth-first traversal order; returns `[]` when the task has no children.
   * @example `descendants("parent")` returns all nested tasks below `parent`.
   */
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

  /**
   * Finds the project and section inherited from the hierarchy root.
   * @param id Task ID whose location to resolve.
   * @returns {{ projectId: string | null; sectionId: string | null }} The highest ancestor's (or task's) project and section IDs, with missing IDs represented as `null`.
   * @example `location("nested-task")` returns the location inherited by that task.
   */
  function location(id: string) {
    const task = ancestors(id).at(-1) ?? byId.get(id);
    return {
      projectId: task?.projectId ?? null,
      sectionId: task?.sectionId ?? null,
    };
  }
  return { byId, children, ancestors, descendants, location };
}

/**
 * Validates task identities and parent-child hierarchy invariants.
 * @param tasks Tasks to validate.
 * @returns {void} When task IDs are unique, every parent chain is valid and acyclic, and subtasks have no direct project or section; otherwise throws an `Error` describing the violated invariant.
 * @example `validateHierarchy(tasks)` verifies that IDs are unique and subtasks inherit location.
 */
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

/**
 * Normalizes a task's location to match its parent or a valid section assignment.
 * @param state Workspace section data used to validate root task placement.
 * @param task Task to normalize.
 * @returns {Task} A shallow copy of `task`; subtasks have `projectId` and `sectionId` set to `null`, while root tasks keep `projectId` and keep `sectionId` only when a section with that ID belongs to the same project.
 * @example `normalizeTask(state, task)` clears direct location fields on a subtask.
 */
export function normalizeTask(
  state: Pick<Workspace, "sections">,
  task: Task,
): Task {
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

/**
 * Reopens every ancestor of a task while leaving other tasks unchanged.
 * @param tasks Tasks in the hierarchy.
 * @param id Task ID whose ancestors should be reopened.
 * @returns {Task[]} A new array where each ancestor of `id` is copied with `completed: false`; all other task objects are unchanged. The task identified by `id` itself is not changed.
 * @example `reopenAncestors(tasks, "child")` reopens the parent chain of `child`.
 */
export function reopenAncestors(tasks: Task[], id: string) {
  const ids = new Set(
    taskIndex(tasks)
      .ancestors(id)
      .map((t) => t.id),
  );
  return tasks.map((t) => (ids.has(t.id) ? { ...t, completed: false } : t));
}

const indexes = new WeakMap<Task[], ReturnType<typeof buildTaskIndex>>();

/**
 * Returns a cached hierarchy index for an immutable task array.
 * @param tasks Task array used as the hierarchy source and cache key.
 * @returns {ReturnType<typeof buildTaskIndex>} The cached index for `tasks`: `byId` maps IDs to tasks, `children` maps parent IDs (including `null`) to order-sorted child arrays, `ancestors(id)` returns immediate-to-root parents, `descendants(id)` returns depth-first descendants, and `location(id)` returns the root project and section IDs with missing values as `null`.
 * @example `taskIndex(state.tasks).byId.get("task-1")` looks up a task by ID.
 */
export function taskIndex(tasks: Task[]) {
  let index = indexes.get(tasks);
  if (!index) {
    index = buildTaskIndex(tasks);
    indexes.set(tasks, index);
  }
  return index;
}
