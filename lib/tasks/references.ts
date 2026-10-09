import type { Task } from "@/types-and-constants/tasks";
import type { Workspace } from "@/types-and-constants/workspace";
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
