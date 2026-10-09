import type { Task } from "@/types-and-constants/tasks";
import type { Workspace } from "@/types-and-constants/workspace";

/**
 * Removes a tag ID from task templates and recurrence exception overrides.
 * @param state Workspace task and exception data.
 * @param id Tag ID being deleted.
 * @returns {{ tasks: Task[]; exceptions: Workspace["exceptions"] }} `tasks` is a new array with `id` removed from matching `tagIds`; `exceptions` is a new record with the same keys and matching override `tagIds` cleaned. Unaffected values are preserved.
 * @example `removeTagReferences(state, "focus")` clears `focus` from tasks and overrides.
 */
export function removeTagReferences(
  state: Pick<Workspace, "tasks" | "exceptions">,
  id: string,
) {
  return {
    tasks: state.tasks.map((t) =>
      t.tagIds.includes(id)
        ? { ...t, tagIds: t.tagIds.filter((key) => key !== id) }
        : t,
    ),
    exceptions: Object.fromEntries(
      Object.entries(state.exceptions).map(([key, e]) => [
        key,
        e.overrides.tagIds?.includes(id)
          ? {
              ...e,
              overrides: {
                ...e.overrides,
                tagIds: e.overrides.tagIds.filter((key) => key !== id),
              },
            }
          : e,
      ]),
    ),
  };
}

/**
 * Moves references to a deleted project back to the inbox in tasks and exceptions.
 * @param state Workspace task and exception data.
 * @param id Project ID being deleted.
 * @returns {{ tasks: Task[]; exceptions: Workspace["exceptions"] }} `tasks` is a new array and `exceptions` a new record with matching `projectId` and `sectionId` set to `null` in task values and exception overrides; unaffected values are preserved.
 * @example `removeProjectReferences(state, "work")` clears the project and section from its tasks.
 */
export function removeProjectReferences(
  state: Pick<Workspace, "tasks" | "exceptions">,
  id: string,
) {
  const update = <T extends Partial<Task>>(task: T): T =>
    task.projectId === id
      ? { ...task, projectId: null, sectionId: null }
      : task;
  return {
    tasks: state.tasks.map(update),
    exceptions: Object.fromEntries(
      Object.entries(state.exceptions).map(([key, e]) => [
        key,
        { ...e, overrides: update(e.overrides) },
      ]),
    ),
  };
}
