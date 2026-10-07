"use client";

import { useDragOperation, useDroppable } from "@dnd-kit/react";
import { Fragment, type ReactNode, useLayoutEffect, useRef } from "react";

import { useWorkspaceController } from "@/contexts/workspace-controller";
import { taskPreviewEntries } from "@/lib/tasks/drag";
import { occurrenceParent } from "@/lib/tasks/recurrence";
import type { Occurrence } from "@/lib/tasks/types";
import { cn } from "@/lib/utils";

export function SectionRemovalDropZone() {
  const { source } = useDragOperation();
  const { allTasks, state } = useWorkspaceController();
  const dragged = allTasks.find((task) => task.id === source?.data.taskId);
  const originalSectionId = dragged?.sectionId;
  const hasParent = !!dragged && !!occurrenceParent(state, dragged);
  const { ref, isDropTarget } = useDroppable({
    id: "section-remove",
    accept: (item) =>
      ["section-task", "row"].includes(String(item.data.kind)) &&
      (originalSectionId != null || hasParent),
    collisionPriority: 2,
    data: { kind: "section-remove", sectionId: null },
  });
  if (
    !source ||
    !["section-task", "row"].includes(String(source.data.kind)) ||
    (originalSectionId == null && !hasParent)
  )
    return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4">
      <div
        ref={ref}
        className={cn(
          "bg-popover pointer-events-auto rounded-lg border border-dashed px-8 py-4 text-xs shadow-lg",
          isDropTarget
            ? "border-primary bg-accent text-accent-foreground"
            : "border-border text-muted-foreground",
        )}
      >
        Move to Unsectioned
      </div>
    </div>
  );
}

/** A DOM snapshot preserves the exact presentation without registering duplicate draggables. */
export function TaskDragSnapshot({
  snapshot,
  placement = false,
}: {
  snapshot: HTMLElement;
  placement?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const container = ref.current;
    if (!container) return;
    const displayed = snapshot.cloneNode(true) as HTMLElement;
    if (placement) {
      displayed.style.width = "100%";
      displayed.style.height = "auto";
    }
    container.replaceChildren(displayed);
    // Match the cloned card so the overlay background and shadow cannot form square corners.
    container.style.borderRadius = getComputedStyle(displayed).borderRadius;
    [displayed, ...displayed.querySelectorAll<HTMLElement>("*")].forEach(
      (element) => {
        element.scrollTop = Number(element.dataset.previewScrollTop ?? 0);
        element.scrollLeft = Number(element.dataset.previewScrollLeft ?? 0);
      },
    );
    return () => container.replaceChildren();
  }, [snapshot, placement]);
  return (
    <div
      ref={ref}
      inert
      aria-hidden="true"
      className={cn(
        "bg-background pointer-events-none",
        !placement && "shadow-2xl",
      )}
    />
  );
}

export function TaskListPreview({
  tasks,
  location,
  children,
}: {
  tasks: Occurrence[];
  location?: Parameters<typeof taskPreviewEntries>[3];
  children: (task: Occurrence, index: number) => ReactNode;
}) {
  const { dragSource, dragDestination, dragSnapshot } =
    useWorkspaceController();
  return taskPreviewEntries(
    tasks,
    dragSource ?? undefined,
    dragDestination,
    location,
  ).map(({ task, preview }, index) =>
    preview ? (
      dragSnapshot ? (
        <div
          key={`preview:${task.id}`}
          data-task-drop-preview={JSON.stringify(dragDestination)}
          className="ring-primary/40 min-w-0 rounded-lg opacity-40 ring-1"
          aria-hidden="true"
        >
          <TaskDragSnapshot snapshot={dragSnapshot} placement />
        </div>
      ) : null
    ) : (
      <Fragment key={task.id}>{children(task, index)}</Fragment>
    ),
  );
}
