"use client";

import { createContext, type ReactNode, useContext, useState } from "react";

import { TaskQuickActionPopover } from "@/components/tasks/controls/task-quick-actions";
import type { CollectionDialogState } from "@/components/workspace/collection-dialog-state";
import { useWorkspaceDrag } from "@/hooks/workspace/use-workspace-drag";
import { useWorkspaceNavigation } from "@/hooks/workspace/use-workspace-navigation";
import { useWorkspaceTaskActions } from "@/hooks/workspace/use-workspace-task-actions";
import { useWorkspaceTaskEditor } from "@/hooks/workspace/use-workspace-task-editor";
import { useWorkspaceView } from "@/hooks/workspace/use-workspace-view";
import { useWorkspace } from "@/stores/workspace/provider";
import type { Project } from "@/types-and-constants/projects";
import type { Section } from "@/types-and-constants/sections";

function useControllerState() {
  const { state, today, save, act, reset, storageError } = useWorkspace();
  const { router, routeKey, view, selectedId, params, setParams } =
    useWorkspaceNavigation();
  const viewData = useWorkspaceView({ state, today, view, selectedId, params });
  const { tags, allTasks, layout, projectId, hierarchyTasks, groups } =
    viewData;
  const { closeTaskActions, ...taskActions } = useWorkspaceTaskActions({
    state,
    routeKey,
  });
  const editor = useWorkspaceTaskEditor({
    state,
    today,
    act,
    view,
    selectedId,
    params,
    setParams,
    router,
    allTasks,
    closeTaskActions,
  });

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [entity, setEntity] = useState<CollectionDialogState | null>(null);
  const [sectionDialog, setSectionDialog] = useState<{
    section?: Section;
    mode?: "rename" | "delete";
    placement?: { relativeTo: string; side: "left" | "right" };
  } | null>(null);
  const [statusCollapsed, setStatusCollapsed] = useState<
    Record<string, boolean>
  >({});
  const [taskExpanded, setTaskExpanded] = useState<Record<string, boolean>>({});
  const drag = useWorkspaceDrag({
    state,
    today,
    act,
    save,
    params,
    layout,
    projectId,
    allTasks,
    hierarchyTasks,
    groups,
    closeTaskActions,
    setStatusCollapsed,
  });

  function reorder(ids: string[]) {
    act({ type: "reorderTasks", tasks: allTasks, ids }, "Task order updated");
  }
  const sidebarProps = {
    view,
    selectedId,
    tasks: allTasks.filter(
      (t) => !t.context?.occurrenceDate || t.context?.occurrenceDate <= today,
    ),
    manage: (kind: "projects" | "tags", item?: Project) =>
      setEntity(
        kind === "tags"
          ? { kind, entity: item ? tags.byId.get(item.id) : undefined }
          : { kind, entity: item },
      ),
  };

  return {
    ...viewData,
    ...taskActions,
    ...editor,
    ...drag,
    state,
    today,
    act,
    reset,
    storageError,
    view,
    selectedId,
    params,
    setParams,
    filtersOpen,
    setFiltersOpen,
    settings,
    setSettings,
    entity,
    setEntity,
    sectionDialog,
    setSectionDialog,
    statusCollapsed,
    setStatusCollapsed,
    taskExpanded,
    setTaskExpanded,
    reorder,
    sidebarProps,
  };
}

const ControllerContext = createContext<ReturnType<
  typeof useControllerState
> | null>(null);

export function WorkspaceController({ children }: { children: ReactNode }) {
  const controller = useControllerState();
  return (
    <ControllerContext.Provider value={controller}>
      {children}
      {controller.quickAction && (
        <TaskQuickActionPopover
          key={`${controller.quickAction.task.id}:${controller.quickAction.kind}`}
          action={controller.quickAction}
        />
      )}
    </ControllerContext.Provider>
  );
}

export function useWorkspaceController() {
  const controller = useContext(ControllerContext);
  if (!controller) throw new Error("WorkspaceController is required");
  return controller;
}
