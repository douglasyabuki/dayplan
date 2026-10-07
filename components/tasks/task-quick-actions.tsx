"use client";

import { type ComponentProps, useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle } from "@/components/ui/popover";
import { useWorkspace } from "@/contexts/workspace";
import { useWorkspaceController } from "@/contexts/workspace-controller";
import { taskDraftAction, type TaskScope } from "@/lib/tasks/operations";
import { reference, resolveOccurrence } from "@/lib/tasks/recurrence";
import type { Occurrence } from "@/lib/tasks/types";
import { cn } from "@/lib/utils";

import { metadataClass, taskInteractionBoundary } from "./task-interaction";
import {
  EditorSelect,
  PriorityFields,
  TaskDateFields,
  TaskLocationFields,
  TaskTagsPicker,
} from "./task-property-controls";

export type QuickActionKind =
  "priority" | "deadline" | "schedule" | "tags" | "location" | "delete";
const titles: Record<QuickActionKind, string> = {
  priority: "Priority",
  deadline: "Deadline",
  schedule: "Scheduled work",
  tags: "Tags",
  location: "Move to",
  delete: "Delete task",
};

export function TaskMetadataButton({
  task,
  kind,
  className,
  ...props
}: ComponentProps<"button"> & { task: Occurrence; kind: QuickActionKind }) {
  const controller = useWorkspaceController();
  return (
    <button
      {...props}
      {...taskInteractionBoundary}
      type="button"
      data-task-quick-trigger
      aria-label={props["aria-label"] ?? titles[kind]}
      aria-haspopup="dialog"
      aria-expanded={
        controller.quickAction?.task.id === task.id &&
        controller.quickAction.kind === kind
      }
      className={cn(metadataClass, className)}
      onClick={(event) => {
        event.stopPropagation();
        controller.showQuickAction(task, kind, event.currentTarget);
      }}
    />
  );
}

export function TaskQuickActionPopover({
  action,
}: {
  action: { task: Occurrence; kind: QuickActionKind; anchor: HTMLElement };
}) {
  const workspace = useWorkspace();
  const controller = useWorkspaceController();
  const [scope, setScope] = useState<TaskScope>("occurrence");
  const [pending, setPending] = useState<Partial<Occurrence>>({});
  const [error, setError] = useState("");
  const task =
    resolveOccurrence(workspace.state, reference(action.task)) ?? action.task;
  const dateAction = action.kind === "schedule" || action.kind === "deadline";
  const positionAnchor = dateAction
    ? (action.anchor.closest<HTMLElement>("[data-task-item]") ?? action.anchor)
    : action.anchor;
  const draft = { ...task, ...pending };
  const close = controller.closeQuickAction;
  function patch(changes: Partial<Occurrence>) {
    const staged = { ...pending, ...changes };
    try {
      workspace.act(
        taskDraftAction(workspace.state, task, { ...task, ...staged }, scope),
        "Task updated",
      );
      setPending({});
      setError("");
      if (action.kind === "priority") close();
    } catch (cause) {
      setPending(staged);
      setError(
        cause instanceof Error ? cause.message : "Unable to update task.",
      );
    }
  }
  function remove() {
    close();
    workspace.confirm({
      title:
        task.context && scope === "series"
          ? "Delete this series and its subtasks?"
          : "Delete this task and its subtasks?",
      description:
        task.context && scope === "occurrence"
          ? "This removes this occurrence and its occurrence subtree. Other occurrences remain. You can Undo this action."
          : "This removes the selected template subtree, including descendant series and their occurrences. You can Undo this action.",
      action: () =>
        workspace.operate({ kind: "delete", task, scope }, "Task deleted"),
    });
  }
  return (
    <Popover
      open
      onOpenChange={(open, details) => {
        const target = details.event?.target;
        if (
          !open &&
          target instanceof Element &&
          target.closest("[data-task-quick-trigger]")
        )
          return;
        if (!open) close();
      }}
    >
      <PopoverContent
        {...taskInteractionBoundary}
        anchor={positionAnchor}
        align="start"
        side="bottom"
        collisionAvoidance={{ side: "flip", align: "shift" }}
        className="max-h-[min(36rem,85dvh,var(--available-height))] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto p-3"
        finalFocus={() =>
          action.anchor.isConnected
            ? action.anchor
            : document.querySelector<HTMLElement>(
                "[data-task-item][tabindex] .task-title",
              )
        }
      >
        {action.kind !== "tags" && (
          <PopoverTitle>{titles[action.kind]}</PopoverTitle>
        )}
        {task.context && action.kind !== "location" && (
          <EditorSelect
            label="Apply changes to"
            value={scope}
            onChange={(value) => {
              setScope(value as TaskScope);
              setPending({});
              setError("");
            }}
            options={[
              { value: "occurrence", label: "This occurrence" },
              { value: "series", label: "Entire series" },
            ]}
          />
        )}
        {action.kind === "priority" && (
          <PriorityFields draft={draft} patch={patch} />
        )}
        {(action.kind === "deadline" || action.kind === "schedule") && (
          <TaskDateFields
            draft={draft}
            patch={patch}
            mode={action.kind}
            recurrenceLocked={!!task.context && scope !== "series"}
            close={close}
          />
        )}
        {action.kind === "tags" && (
          <TaskTagsPicker draft={draft} patch={patch} state={workspace.state} />
        )}
        {action.kind === "location" && (
          <TaskLocationFields
            draft={draft}
            patch={patch}
            state={workspace.state}
          />
        )}
        {action.kind === "delete" && (
          <>
            <p className="text-muted-foreground text-sm">
              Deletion includes subtasks within the selected scope. A
              confirmation follows; Undo is available after deleting.
            </p>
            <Button variant="destructive" onClick={remove}>
              Delete{" "}
              {task.context && scope === "series" ? "entire series" : "task"}…
            </Button>
          </>
        )}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
