import { saveProject } from "@/lib/projects/operations";
import { reorderSections, saveSection } from "@/lib/sections/operations";
import { applyTaskMutation } from "@/lib/tasks/mutations";
import { containerKey } from "@/lib/workspace/layout";
import type { Action } from "@/stores/workspace/actions";
import {
  deleteProject,
  deleteTag,
  deleteWorkspaceSection,
  moveTag,
  moveWorkspaceSection,
  saveTag,
} from "@/stores/workspace/transitions";
import { type Workspace } from "@/types-and-constants/workspace";
export function reducer(state: Workspace, action: Action): Workspace {
  switch (action.type) {
    case "replace":
      return action.state;

    case "batch":
      return action.actions.reduce(reducer, state);

    case "section": {
      const sections = saveSection(
        state.sections,
        state.projects,
        action.section,
      );
      return sections === state.sections ? state : { ...state, sections };
    }

    case "moveSection": {
      return moveWorkspaceSection(state, action);
    }

    case "deleteSection": {
      return deleteWorkspaceSection(state, action);
    }

    case "reorderSections": {
      return {
        ...state,
        sections: reorderSections(state.sections, action.projectId, action.ids),
      };
    }

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

    case "entity": {
      if (action.kind === "tags") return saveTag(state, action.entity);
      return { ...state, projects: saveProject(state.projects, action.entity) };
    }

    case "deleteEntity": {
      return action.kind === "tags"
        ? deleteTag(state, action.id)
        : deleteProject(state, action.id);
    }
    default:
      return applyTaskMutation(state, action);
  }
}
