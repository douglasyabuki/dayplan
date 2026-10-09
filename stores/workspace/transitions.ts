import * as projectRules from "@/lib/projects/operations";
import * as sectionRules from "@/lib/sections/operations";
import * as tagRules from "@/lib/tags/operations";
import { applyTaskMutation, patchReference } from "@/lib/tasks/mutations";
import {
  removeProjectReferences,
  removeTagReferences,
} from "@/lib/tasks/references";
import type { Action } from "@/stores/workspace/actions";
import type { Tag } from "@/types-and-constants/tags";
import type { Workspace } from "@/types-and-constants/workspace";
export function moveTag(
  state: Workspace,
  id: string,
  parentId: string | null,
  beforeId?: string,
): Workspace {
  const tags = tagRules.moveTag(state.tags, id, parentId, beforeId);
  return tags === state.tags ? state : { ...state, tags };
}
export function saveTag(state: Workspace, tag: Tag): Workspace {
  const tags = tagRules.saveTag(state.tags, tag);
  return tags === state.tags ? state : { ...state, tags };
}
export function deleteTag(state: Workspace, id: string): Workspace {
  const tags = tagRules.deleteTag(state.tags, id);
  return tags === state.tags
    ? state
    : { ...state, tags, ...removeTagReferences(state, id) };
}
export function deleteProject(state: Workspace, id: string): Workspace {
  return {
    ...state,
    projects: projectRules.deleteProject(state.projects, id),
    sections: sectionRules.removeProjectSections(state.sections, id),
    ...removeProjectReferences(state, id),
  };
}
export function moveWorkspaceSection(
  state: Workspace,
  action: Extract<Action, { type: "moveSection" }>,
): Workspace {
  const sections = sectionRules.moveSection(
    state.sections,
    state.projects,
    action.id,
    action.projectId,
  );
  if (sections === state.sections) return state;
  const next: Workspace = { ...state, sections };
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
        if ("projectId" in overrides) overrides.projectId = action.projectId;
        return [key, { ...exception, overrides }];
      }),
    ),
  };
  return moved;
}
export function deleteWorkspaceSection(
  state: Workspace,
  action: Extract<Action, { type: "deleteSection" }>,
): Workspace {
  if (
    !sectionRules.canDeleteSection(
      state.sections,
      action.id,
      action.destination,
    )
  )
    return state;
  let next = state;
  for (const task of state.tasks.filter(
    (t) => !t.parentId && t.sectionId === action.id,
  ))
    next = action.deleteTasks
      ? applyTaskMutation(next, { type: "delete", id: task.id })
      : patchReference(
          next,
          { taskId: task.id },
          { sectionId: action.destination },
        );
  return {
    ...next,
    sections: sectionRules.deleteSection(next.sections, action.id),
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
