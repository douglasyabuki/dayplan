"use client";

import { useEffect, useState } from "react";

import type { QuickActionKind } from "@/components/tasks/controls/task-quick-actions";
import { resolveOccurrence } from "@/lib/tasks/recurrence";
import type { Occurrence } from "@/types-and-constants/tasks";
import type { Workspace } from "@/types-and-constants/workspace";

type WorkspaceTaskActionsOptions = {
  state: Workspace;
  routeKey: string;
};

/**
 * Tracks task quick actions and context menus for the active workspace route.
 * @param {WorkspaceTaskActionsOptions} options Current workspace state and route key.
 * @returns {object} An object with the route-valid `quickAction` or null, `closeQuickAction`, `showQuickAction`, the route-valid `contextMenuId` or null, `setContextMenuId`, and `closeTaskActions`.
 * @example
 * const actions = useWorkspaceTaskActions({ state, routeKey });
 * actions.showQuickAction(task, "schedule", anchor);
 */
export function useWorkspaceTaskActions({
  state,
  routeKey,
}: WorkspaceTaskActionsOptions) {
  const [quickAction, setQuickAction] = useState<{
    task: Occurrence;
    kind: QuickActionKind;
    anchor: HTMLElement;
    routeKey: string;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    id: string;
    routeKey: string;
  } | null>(null);
  function closeTaskActions() {
    setQuickAction(null);
    setContextMenu(null);
  }
  function showQuickAction(
    task: Occurrence,
    kind: QuickActionKind,
    anchor: HTMLElement,
  ) {
    setContextMenu(null);
    setQuickAction((current) =>
      current?.task.id === task.id &&
      current.kind === kind &&
      current.anchor === anchor
        ? null
        : { task, kind, anchor, routeKey },
    );
  }
  useEffect(() => {
    // Route navigation invalidates anchors and prevents actions from returning on Back.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuickAction(null);
    setContextMenu(null);
  }, [routeKey]);
  useEffect(() => {
    if (quickAction && !resolveOccurrence(state, quickAction.task)) {
      // A removed occurrence must not reopen if Undo later restores it.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuickAction(null);
    }
  }, [state, quickAction]);

  return {
    quickAction:
      quickAction?.routeKey === routeKey &&
      resolveOccurrence(state, quickAction.task)
        ? quickAction
        : null,
    closeQuickAction: () => setQuickAction(null),
    showQuickAction,
    contextMenuId: contextMenu?.routeKey === routeKey ? contextMenu.id : null,
    setContextMenuId: (id: string | null) => {
      setContextMenu(id ? { id, routeKey } : null);
      if (id) setQuickAction(null);
    },
    closeTaskActions,
  };
}
