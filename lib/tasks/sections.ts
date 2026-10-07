import { normalizeTask } from "./hierarchy";
import { reducer } from "./store";
import type { Occurrence, Task, Workspace } from "./types";
export function validSection<T extends Task>(state: Workspace, task: T): T {
  return normalizeTask(state, task) as T;
}
export function reorderTasks(
  state: Workspace,
  tasks: Occurrence[],
  ids: string[],
) {
  return reducer(state, { type: "reorderTasks", tasks, ids });
}
export function moveTask(
  state: Workspace,
  task: Occurrence,
  sectionId: string | null,
  tasks: Occurrence[],
  beforeId?: string,
) {
  return reducer(state, { type: "moveTask", task, sectionId, tasks, beforeId });
}
export function deleteSection(
  state: Workspace,
  id: string,
  destination: string | null,
  deleteTasks: boolean,
) {
  return reducer(state, {
    type: "deleteSection",
    id,
    destination,
    deleteTasks,
  });
}
