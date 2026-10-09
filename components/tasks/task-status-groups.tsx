"use client";

import { useDroppable } from "@dnd-kit/react";
import { ChevronDown } from "lucide-react";
import { type ReactNode, useEffect } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { useWorkspaceController } from "@/contexts/workspace-controller";
import { referenceKey } from "@/lib/tasks/recurrence";
import { cn } from "@/lib/utils";
import type { Occurrence, TaskReference } from "@/types-and-constants/tasks";

import { TaskListPreview } from "./task-drag-feedback";

type Location = {
  parentRef?: TaskReference | null;
  projectId: string | null;
  sectionId: string | null;
};
type Props = {
  tasks: Occurrence[];
  location: Location;
  depth?: number;
  disabled?: boolean;
  children: (task: Occurrence, index: number) => ReactNode;
};

/** Partitions only this sibling set; descendants remain inside their own cards. */
export function TaskStatusGroups(props: Props) {
  const { statusGrouping } = useWorkspaceController();
  if (!statusGrouping) return <TaskListPreview {...props} />;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {[false, true].map((completed) => (
        <StatusGroup
          key={String(completed)}
          {...props}
          completed={completed}
          tasks={props.tasks.filter((task) => task.completed === completed)}
        />
      ))}
    </div>
  );
}

function StatusGroup({
  tasks,
  location,
  depth = 0,
  disabled,
  children,
  completed,
}: Props & { completed: boolean }) {
  const { statusCollapsed, setStatusCollapsed, dragSource, params } =
    useWorkspaceController();
  const key = JSON.stringify([
    location.projectId,
    location.sectionId,
    location.parentRef ? referenceKey(location.parentRef) : null,
    completed,
  ]);
  const label = completed ? "Completed" : "Open";
  const nested = !!location.parentRef;
  const heading = !location.parentRef || completed;
  const collapsed = heading && !!statusCollapsed[key];
  const setOpen = (open: boolean) =>
    setStatusCollapsed((previous) => ({ ...previous, [key]: !open }));
  const { ref, isDropTarget } = useDroppable({
    id: `status-group:${key}`,
    accept: ["section-task", "row"],
    collisionPriority: depth + (collapsed ? 2 : 0.5),
    disabled,
    data: { kind: "status-group", ...location, completed },
  });
  const query = params.toString();
  useEffect(() => {
    if (!isDropTarget || !collapsed || !dragSource) return;
    const timer = setTimeout(
      () => setStatusCollapsed((previous) => ({ ...previous, [key]: false })),
      400,
    );
    return () => clearTimeout(timer);
  }, [isDropTarget, collapsed, dragSource, key, query, setStatusCollapsed]);

  const content = (
    <div className="flex min-w-0 flex-col gap-1.5">
      <TaskListPreview tasks={tasks} location={{ ...location, completed }}>
        {children}
      </TaskListPreview>
      {!tasks.length && (heading || dragSource) && (
        <Empty className="items-start gap-0 px-2 py-2">
          <EmptyHeader>
            <EmptyDescription>
              {dragSource
                ? `Drop here to mark ${label.toLowerCase()}`
                : `No ${label.toLowerCase()} tasks`}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
  return (
    <div
      ref={ref}
      data-status-group={label.toLowerCase()}
      data-status-parent={
        location.parentRef ? referenceKey(location.parentRef) : "root"
      }
      data-status-key={key}
      data-status-collapsed={collapsed || undefined}
      data-status-project-id={location.projectId ?? ""}
      data-status-section-id={location.sectionId ?? ""}
      data-status-parent-ref={JSON.stringify(location.parentRef ?? null)}
      data-status-completed={completed}
      className={cn(
        "min-w-0 rounded-md",
        isDropTarget && "bg-accent/50",
        dragSource && "min-h-8",
      )}
      onClick={(event) => event.stopPropagation()}
    >
      {heading ? (
        <Collapsible open={!collapsed} onOpenChange={setOpen}>
          <CollapsibleTrigger
            render={
              <Button
                variant="subtle"
                size={nested ? "compact" : "sm"}
                className={cn("justify-start", nested ? "w-fit" : "w-full")}
                disabled={!!dragSource}
              />
            }
          >
            <ChevronDown
              data-icon="inline-start"
              className={cn("transition-transform", collapsed && "-rotate-90")}
            />
            {label}
            {nested ? (
              <span className="tabular-nums">{tasks.length}</span>
            ) : (
              <Badge variant="secondary">{tasks.length}</Badge>
            )}
          </CollapsibleTrigger>
          <CollapsibleContent>{content}</CollapsibleContent>
        </Collapsible>
      ) : (
        content
      )}
    </div>
  );
}
