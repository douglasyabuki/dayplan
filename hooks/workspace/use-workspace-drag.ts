"use client";

import type { DragEndEvent, DragMoveEvent } from "@dnd-kit/react";
import { type Dispatch, type SetStateAction, useRef, useState } from "react";

import { toast } from "@/components/ui/toast";
import { addDays } from "@/lib/dates";
import {
  type DragDestination,
  dragDestination as resolveDragDestination,
  taskPointerIntent,
} from "@/lib/tasks/drag";
import {
  type GroupDestination,
  groupDestination,
  groupDropAction,
} from "@/lib/workspace/group-drag";
import type { groupTasks } from "@/lib/workspace/grouping";
import {
  emptyGroupTargets,
  isAggregateView,
  makeGroup,
  resolveGrouping,
} from "@/lib/workspace/grouping";
import { taskDropAction } from "@/stores/workspace/commands";
import type { useWorkspace } from "@/stores/workspace/provider";
import type { Occurrence } from "@/types-and-constants/tasks";
import type { TaskLayout } from "@/types-and-constants/workspace";

type WorkspaceDragOptions = Pick<
  ReturnType<typeof useWorkspace>,
  "state" | "today" | "act" | "save"
> & {
  params: URLSearchParams;
  view: string;
  layout: TaskLayout;
  projectId: string | null;
  allTasks: Occurrence[];
  hierarchyTasks: Occurrence[];
  groups: ReturnType<typeof groupTasks>;
  closeTaskActions: () => void;
  setStatusCollapsed: Dispatch<SetStateAction<Record<string, boolean>>>;
};

/**
 * Coordinates task and section drag previews and applies valid workspace drop actions.
 * @param {WorkspaceDragOptions} options Workspace state and mutation functions, route and layout data, task collections, grouping, and task-action and status-collapse controls.
 * @returns {object} Drag state (`dragDestination`, `dragSnapshot`, and `dragSource`) and the `dragStart`, `dragMove`, and `dragEnd` handlers for the drag-and-drop system.
 * @example
 * const drag = useWorkspaceDrag({ ...workspace, params, layout, projectId, allTasks, hierarchyTasks, groups, closeTaskActions, setStatusCollapsed });
 * <DndContext onDragStart={drag.dragStart} onDragMove={drag.dragMove} onDragEnd={drag.dragEnd} />
 */
export function useWorkspaceDrag({
  state,
  today,
  act,
  save,
  params,
  view,
  layout,
  projectId,
  allTasks,
  hierarchyTasks,
  groups,
  closeTaskActions,
  setStatusCollapsed,
}: WorkspaceDragOptions) {
  const [pendingDateDrop, setPendingDateDrop] = useState<{
    taskId: string;
    destination: GroupDestination;
  } | null>(null);
  const [groupDropError, setGroupDropError] = useState("");
  const dateDropReturnFocus = useRef<HTMLElement | null>(null);
  const [dragDestination, setDragDestination] =
    useState<DragDestination | null>(null);
  const [dragSnapshot, setDragSnapshot] = useState<HTMLElement | null>(null);
  const [dragSource, setDragSource] = useState<Occurrence | null>(null);
  const dragDraft = useRef<{
    sourceId: string | null;
    destination: DragDestination | null;
  }>({ sourceId: null, destination: null });
  const dragGeneration = useRef(0);
  const statusHover = useRef<{
    key: string;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  function clearStatusHover() {
    if (statusHover.current?.timer) clearTimeout(statusHover.current.timer);
    statusHover.current = null;
  }
  function clearDrag() {
    clearStatusHover();
    const generation = ++dragGeneration.current;
    dragDraft.current = { sourceId: null, destination: null };
    // Unregistering a nested sortable can dispatch a canceled drag from dnd-kit's
    // insertion-effect cleanup. React updates must wait until that commit ends.
    queueMicrotask(() => {
      if (generation !== dragGeneration.current) return;
      setDragDestination(null);
      setDragSnapshot(null);
      setDragSource(null);
    });
  }

  const keyboardDirection = useRef<"before" | "after" | "inside">("after");

  function dragStart(event: Pick<DragMoveEvent, "operation">) {
    setGroupDropError("");
    closeTaskActions();
    clearStatusHover();
    dragGeneration.current++;
    const sourceId = event.operation.source?.data.taskId as string | undefined;
    dragDraft.current = { sourceId: sourceId ?? null, destination: null };
    setDragDestination(null);
    setDragSource(allTasks.find((task) => task.id === sourceId) ?? null);
    keyboardDirection.current = "after";
    const element = event.operation.source?.element;
    if (!(element instanceof HTMLElement)) return;
    const snapshot = element.cloneNode(true) as HTMLElement;
    const rect = element.getBoundingClientRect();
    snapshot.style.width = `${rect.width}px`;
    snapshot.style.height = `${rect.height}px`;
    snapshot.style.flex = "none";
    snapshot.style.margin = "0";
    snapshot.style.opacity = "1";
    const kind = event.operation.source?.data.kind;
    if (layout === "list" && (kind === "row" || kind === "section-task"))
      snapshot.style.borderBottom = "none";
    const computed = getComputedStyle(element);
    for (const name of computed) {
      if (name.startsWith("--"))
        snapshot.style.setProperty(name, computed.getPropertyValue(name));
    }
    snapshot.inert = true;
    snapshot.setAttribute("aria-hidden", "true");
    const originals = [element, ...element.querySelectorAll<HTMLElement>("*")];
    const copies = [snapshot, ...snapshot.querySelectorAll<HTMLElement>("*")];
    copies.forEach((copy, index) => {
      copy.removeAttribute("id");
      // Store scroll offsets until the clone is connected in the overlay.
      copy.dataset.previewScrollTop = String(originals[index].scrollTop);
      copy.dataset.previewScrollLeft = String(originals[index].scrollLeft);
    });
    setDragSnapshot(snapshot);
  }

  function destinationFor(
    event: DragMoveEvent | DragEndEvent,
    targetData?: Record<string, unknown>,
  ): DragDestination | null {
    const { source, target, position, activatorEvent } = event.operation;
    const coordinates = "to" in event && event.to ? event.to : position.current;
    // The incoming preview is deliberately not another draggable/droppable.
    // Preserve its exact slot while the pointer is over it, rather than
    // interpreting the surrounding section as an append-to-end destination.
    if (
      source &&
      activatorEvent?.type !== "keydown" &&
      dragDraft.current.destination
    ) {
      const preview = document
        .elementFromPoint(coordinates.x, coordinates.y)
        ?.closest<HTMLElement>("[data-task-drop-preview]");
      if (
        preview?.dataset.taskDropPreview ===
        JSON.stringify(dragDraft.current.destination)
      )
        return dragDraft.current.destination;
    }
    if (!source) return null;
    const data = targetData ?? target?.data;
    if (!data) return null;
    const sourceData = source.data;
    const manual = (params.get("sort") ?? "manual") === "manual";
    const rect = target?.element?.getBoundingClientRect();
    const horizontal = sourceData.kind === "section" && layout === "board";
    const keyboard = activatorEvent?.type === "keydown";
    const after = rect
      ? keyboard
        ? keyboardDirection.current === "after"
        : horizontal
          ? coordinates.x >= rect.left + rect.width / 2
          : coordinates.y >= rect.top + rect.height / 2
      : false;
    if (isAggregateView(view) && typeof data.aggregateGroupId === "string") {
      const kind = resolveGrouping(view, params);
      const group =
        data.chooseDate && (kind === "schedule" || kind === "deadline")
          ? makeGroup(kind, null, state, today)
          : [...groups, ...emptyGroupTargets(kind, state, params, today)].find(
              (g) => g.id === data.aggregateGroupId,
            );
      const task = allTasks.find((t) => t.id === sourceData.taskId);
      if (!group || !task) return null;
      if (data.chooseDate) group.id = String(data.aggregateGroupId);
      const sameGroup = sourceData.aggregateGroupId === group.id;
      const blockedReason =
        !sameGroup && !group.canDrop
          ? group.kind === "today"
            ? "Tasks cannot move between Today and Overdue by dragging. Edit the task’s due date instead."
            : group.kind === "upcoming"
              ? "Tasks cannot move between Upcoming date groups by dragging. Edit the task’s scheduled or due date, or group by Scheduled date or Due date."
              : "This grouping does not support moving tasks between groups."
          : sameGroup &&
              !manual &&
              typeof data.taskId === "string" &&
              data.taskId !== task.id
            ? "Switch to Manual order to reorder tasks within this group."
            : null;
      if (blockedReason)
        return {
          kind: "aggregate-group",
          group,
          intent: "location",
          ids: [],
          blockedReason,
        };
      const destination = groupDestination(
        task,
        sourceData.aggregateGroupId,
        group,
        manual,
        typeof data.taskId === "string" ? data.taskId : undefined,
        after,
        !!data.chooseDate,
        dragDraft.current.destination?.kind === "aggregate-group"
          ? dragDraft.current.destination
          : null,
      );
      if (!destination || destination.chooseDate) return destination;
      try {
        groupDropAction(state, task, destination, allTasks, today);
        return destination;
      } catch (cause) {
        return {
          ...destination,
          blockedReason:
            cause instanceof Error
              ? cause.message
              : "This task cannot move here.",
        };
      }
    }
    const header = target?.element
      ?.querySelector<HTMLElement>(".task-title")
      ?.getBoundingClientRect();
    const intent =
      data.kind === "task-children"
        ? "inside"
        : keyboard
          ? keyboardDirection.current === "inside"
            ? "inside"
            : keyboardDirection.current
          : header
            ? taskPointerIntent(
                coordinates,
                header,
                layout === "list" &&
                  dragDraft.current.destination?.kind === "task" &&
                  dragDraft.current.destination.intent === "inside" &&
                  dragDraft.current.destination.targetId === data.taskId,
              )
            : after
              ? "after"
              : "before";
    return resolveDragDestination({
      sourceData,
      data,
      after,
      intent,
      manual,
      sections: state.sections,
      projectId,
      allTasks,
      visible: hierarchyTasks,
      groups,
      state,
      previous: dragDraft.current.destination,
      canceled: "canceled" in event && event.canceled,
    });
  }

  function dragMove(event: DragMoveEvent) {
    if (event.nativeEvent instanceof KeyboardEvent) {
      const key = event.nativeEvent.key;
      if (key === "ArrowRight") keyboardDirection.current = "inside";
      if (["ArrowDown"].includes(key)) keyboardDirection.current = "after";
      if (["ArrowUp", "ArrowLeft"].includes(key))
        keyboardDirection.current = "before";
    }
    const coordinates =
      "to" in event && event.to ? event.to : event.operation.position.current;
    const hoveredGroup = document
      .elementFromPoint(coordinates.x, coordinates.y)
      ?.closest<HTMLElement>("[data-status-key]");
    const hoveredKey = hoveredGroup?.dataset.statusKey;
    const collapsed = hoveredGroup?.dataset.statusCollapsed === "true";
    if (hoveredKey !== statusHover.current?.key) {
      clearStatusHover();
      if (hoveredKey && collapsed) {
        const timer = setTimeout(() => {
          setStatusCollapsed((previous) =>
            previous[hoveredKey]
              ? { ...previous, [hoveredKey]: false }
              : previous,
          );
          if (statusHover.current?.key === hoveredKey)
            statusHover.current.timer = null;
        }, 400);
        statusHover.current = { key: hoveredKey, timer };
      }
    }
    // Retain a status preview only while expansion temporarily removes its
    // collision target. A resolved no-op (returning to the original slot) must
    // clear the preview, including when neither status-group key exists.
    const keepHoveredGroup =
      !event.operation.target &&
      hoveredKey !== undefined &&
      hoveredKey === statusHover.current?.key;
    const statusGroupData =
      hoveredGroup && collapsed
        ? {
            kind: "status-group",
            projectId: hoveredGroup.dataset.statusProjectId || null,
            sectionId: hoveredGroup.dataset.statusSectionId || null,
            parentRef: JSON.parse(
              hoveredGroup.dataset.statusParentRef ?? "null",
            ),
            completed: hoveredGroup.dataset.statusCompleted === "true",
          }
        : undefined;
    const destination =
      destinationFor(event, statusGroupData) ??
      (keepHoveredGroup ? dragDraft.current.destination : null);
    dragDraft.current.destination = destination;
    const generation = dragGeneration.current;
    // Registration/layout changes can emit dragover during insertion effects.
    // Publish only the latest hover after React has finished committing.
    queueMicrotask(() => {
      if (generation !== dragGeneration.current) return;
      setDragDestination(dragDraft.current.destination);
    });
  }
  function dragEnd(event: DragEndEvent) {
    const { source, target } = event.operation;
    dateDropReturnFocus.current =
      source?.element instanceof HTMLElement ? source.element : null;
    const destination = event.canceled
      ? null
      : (destinationFor(event) ??
        // Only a missing collision target can use the last preview. A present
        // target resolving to null explicitly rejects or cancels that move.
        (target || dragDraft.current.destination?.kind === "aggregate-group"
          ? null
          : dragDraft.current.destination));
    clearDrag();
    if (event.canceled) return;
    if (!source || (!target && !destination)) return;
    // Finish dnd-kit's operation before a committed move unmounts a source
    // in its old parent (unregistration otherwise emits inside insertion effects).
    queueMicrotask(() =>
      finishDrop(destination, source.data, target?.data ?? {}),
    );
  }
  function finishDrop(
    destination: DragDestination | null,
    sourceData: Record<string, unknown>,
    data: Record<string, unknown>,
  ) {
    if (destination?.kind === "section") {
      act(
        { type: "reorderSections", projectId, ids: destination.ids },
        "Section order updated",
      );
      return;
    }
    const task = allTasks.find((t) => t.id === sourceData.taskId);
    if (!task) return;
    if (destination?.kind === "aggregate-group") {
      if (destination.blockedReason) {
        toast.add({
          title: "Task wasn’t moved",
          description: destination.blockedReason,
          type: "info",
        });
      } else if (destination.chooseDate) {
        setPendingDateDrop({ taskId: task.id, destination });
      } else commitGroupDrop(task, destination);
      return;
    }
    if (destination?.kind === "task") {
      act(
        taskDropAction(state, task, destination, allTasks, today),
        destination.completed === undefined
          ? "Task moved"
          : destination.completed
            ? "Task completed"
            : "Task reopened",
      );
      return;
    }
    if (data.kind === "calendar") {
      const targetDate = addDays(
        String(data.date),
        -Number(sourceData.dayOffset ?? 0),
      );
      const time =
        data.mode === "time"
          ? String(data.time)
          : data.mode === "month"
            ? task.schedule?.time
            : undefined;
      save(
        {
          ...task,
          schedule: {
            date: targetDate,
            time,
            duration: task.schedule?.duration ?? 30,
          },
        },
        "Task rescheduled",
      );
    }
  }

  function commitGroupDrop(task: Occurrence, destination: GroupDestination) {
    try {
      act(
        groupDropAction(state, task, destination, allTasks, today),
        destination.intent === "location"
          ? "Task updated"
          : "Task order updated",
      );
      setGroupDropError("");
    } catch (cause) {
      setGroupDropError(
        cause instanceof Error ? cause.message : "Unable to move this task.",
      );
    }
  }

  function chooseDropDate(date: string) {
    if (!pendingDateDrop) return;
    const task = allTasks.find((t) => t.id === pendingDateDrop.taskId);
    if (task)
      commitGroupDrop(task, {
        ...pendingDateDrop.destination,
        chooseDate: false,
        group: { ...pendingDateDrop.destination.group, value: date },
      });
    setPendingDateDrop(null);
  }

  return {
    dateDropReturnFocus,
    pendingDateDrop,
    cancelDateDrop: () => setPendingDateDrop(null),
    chooseDropDate,
    groupDropError,
    dragDestination,
    dragSnapshot,
    dragSource,
    dragStart,
    dragMove,
    dragEnd,
  };
}
