"use client";

import { pointerIntersection } from "@dnd-kit/collision";
import { SortableKeyboardPlugin } from "@dnd-kit/dom/sortable";
import { useDroppable } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import { ChevronDown, Plus, Sun } from "lucide-react";
import { useState } from "react";

import {
  type OpenTask,
  taskCardSensors,
  TaskItem,
  type TaskOpenOptions,
} from "@/components/tasks/task-item";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ItemGroup } from "@/components/ui/item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWorkspaceController } from "@/contexts/workspace-controller";
import { formatDate } from "@/lib/dates";
import { previewOrder } from "@/lib/tasks/drag";
import { cn } from "@/lib/utils";
import { groupDropAction } from "@/lib/workspace/group-drag";
import {
  emptyGroupTargets,
  isAggregateView,
  type TaskGroup,
} from "@/lib/workspace/grouping";
import { useWorkspace } from "@/stores/workspace/provider";
import type { Occurrence } from "@/types-and-constants/tasks";

import { TaskListPreview } from "./task-drag-feedback";

function TaskGroupRow({
  board,
  task,
  group,
  index,
  manual,
  open,
}: {
  board: boolean;
  task: Occurrence;
  group: TaskGroup;
  index: number;
  manual: boolean;
  open: (options?: TaskOpenOptions) => void;
}) {
  const { state, today, toggle, act } = useWorkspace();
  const { editorHandle, view, allTasks } = useWorkspaceController();
  const aggregate = isAggregateView(view);
  const { ref, isDragging } = useSortable({
    sensors: taskCardSensors,
    plugins: [SortableKeyboardPlugin],
    id: `row:${group.id}:${task.id}`,
    index,
    group: group.id,
    type: "row",
    accept: ["row", "section-task"],
    disabled: task.archived,
    ...(aggregate ? { collisionDetector: pointerIntersection } : {}),
    data: {
      taskId: task.id,
      kind: "row",
      group: group.id,
      ...(aggregate ? { aggregateGroupId: group.id } : {}),
    },
  });
  const project =
    view === "projects" || view === "inbox"
      ? undefined
      : state.projects.find((p) => p.id === task.projectId);
  const roles =
    group.appearances.find((a) => a.task.id === task.id)?.roles ?? [];
  const taskIndex = group.tasks.findIndex((t) => t.id === task.id);
  const canOrder =
    aggregate &&
    manual &&
    !task.archived &&
    new Set(group.tasks.map((t) => t.taskId)).size === group.tasks.length;
  function move(direction: number) {
    const ids = group.tasks.map((t) => t.id);
    [ids[taskIndex], ids[taskIndex + direction]] = [
      ids[taskIndex + direction],
      ids[taskIndex],
    ];
    act(
      groupDropAction(
        state,
        task,
        { kind: "aggregate-group", group, ids, intent: "before" },
        allTasks,
        today,
      ),
      "Task order updated",
    );
  }
  return (
    <div>
      {roles.length > 0 && (
        <div className="mb-1 flex flex-wrap items-center gap-2 px-2">
          {roles.map((role) => (
            <Badge key={role} variant="secondary">
              {role}
            </Badge>
          ))}
        </div>
      )}
      <TaskItem
        task={task}
        board={board}
        today={today}
        project={project}
        tags={state.tags.filter((tag) => task.tagIds.includes(tag.id))}
        handle={editorHandle}
        onOpen={open}
        onComplete={() => toggle(task)}
        itemRef={ref}
        dragging={isDragging}
        movable={!task.archived}
        manual={manual}
        groupOrder={aggregate}
        up={canOrder && taskIndex > 0 ? () => move(-1) : undefined}
        down={
          canOrder && taskIndex < group.tasks.length - 1
            ? () => move(1)
            : undefined
        }
      />
    </div>
  );
}

function TaskGroupSection({
  board,
  group,
  manual,
  open,
  add,
}: {
  board: boolean;
  group: TaskGroup;
  manual: boolean;
  open: OpenTask;
  add: (group?: TaskGroup) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const { view, dragDestination, dragSource } = useWorkspaceController();
  const aggregate = isAggregateView(view);
  const { ref } = useDroppable({
    id: `aggregate:${group.id}`,
    accept: ["row", "section-task"],
    collisionPriority: -1,
    collisionDetector: pointerIntersection,
    disabled: !aggregate,
    data: { kind: "aggregate-group", aggregateGroupId: group.id },
  });
  const destination =
    dragDestination?.kind === "aggregate-group" &&
    dragDestination.group.id === group.id
      ? dragDestination
      : null;
  const formatted = /^\d{4}-\d{2}-\d{2}$/.test(group.label)
    ? formatDate(group.label, {
        weekday: "long",
        month: "short",
        day: "numeric",
        ...(view === "upcoming" ? { year: "numeric" as const } : {}),
      })
    : group.label;
  const tasks =
    destination &&
    !destination.blockedReason &&
    destination.intent !== "location"
      ? previewOrder(group.tasks, destination)
      : group.tasks;
  const row = (task: Occurrence, index: number) => (
    <TaskGroupRow
      key={task.id}
      board={board}
      task={task}
      group={group}
      index={index}
      manual={manual}
      open={(options) => open(task, options)}
    />
  );
  const rows =
    !collapsed &&
    (aggregate ? (
      tasks.map(row)
    ) : (
      <TaskListPreview tasks={tasks}>{row}</TaskListPreview>
    ));
  return (
    <section
      ref={ref}
      aria-label={formatted}
      data-aggregate-group={aggregate ? group.id : undefined}
      className={cn(
        "relative",
        board
          ? "bg-muted/35 flex h-full min-h-0 w-80 shrink-0 flex-col rounded-xl border max-md:w-[min(300px,calc(100vw-56px))]"
          : "mb-8",
        destination &&
          !destination.blockedReason &&
          "bg-accent/30 inset-ring-primary inset-ring-2",
      )}
    >
      <button
        className={cn(
          "section-heading mb-2 flex shrink-0 items-center gap-2 text-xs font-medium",
          board && "px-3 pt-3",
          group.value === "overdue" && "text-destructive",
        )}
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
      >
        <ChevronDown
          className={cn(
            "size-3.5 transition-transform",
            collapsed && "-rotate-90",
          )}
        />
        {formatted}
        <span className="text-muted-foreground ml-1 text-[10px] font-normal">
          {tasks.length}
        </span>
      </button>
      {aggregate && dragSource && destination && (
        <p
          role="status"
          className={
            destination.blockedReason
              ? "bg-popover text-popover-foreground pointer-events-none absolute inset-x-3 bottom-12 z-10 rounded-md border p-2 text-xs shadow-sm"
              : "sr-only"
          }
        >
          {destination.blockedReason ??
            (destination.intent === "location"
              ? `Move to ${formatted}`
              : "Update manual order")}
        </p>
      )}
      {board ? (
        <ScrollArea className="min-h-0 flex-1 px-3 pb-3">
          <ItemGroup className="gap-1.5">{rows}</ItemGroup>
        </ScrollArea>
      ) : (
        <ItemGroup className="gap-1.5">{rows}</ItemGroup>
      )}
      {!tasks.length && dragSource && (
        <p className="text-muted-foreground p-3 text-xs">Drop here</p>
      )}
      {aggregate && group.canCreate && !collapsed && (
        <Button
          variant="ghost"
          className="m-1 shrink-0 justify-start"
          onClick={() => add(group)}
          aria-label={`Add task to ${formatted}`}
        >
          <Plus data-icon="inline-start" />
          Add task
        </Button>
      )}
    </section>
  );
}

function DateGroupTarget({ kind }: { kind: "schedule" | "deadline" }) {
  const { dragDestination } = useWorkspaceController();
  const { ref } = useDroppable({
    id: `aggregate:choose:${kind}`,
    accept: ["row", "section-task"],
    collisionPriority: 0,
    collisionDetector: pointerIntersection,
    data: {
      kind: "aggregate-group",
      aggregateGroupId: `choose:${kind}`,
      chooseDate: true,
    },
  });
  const active =
    dragDestination?.kind === "aggregate-group" && dragDestination.chooseDate;
  return (
    <div
      ref={ref}
      data-date-drop-target={kind}
      className={cn(
        "flex min-h-20 shrink-0 items-center rounded-xl border border-dashed p-4 text-sm",
        active && "bg-accent/30 inset-ring-primary inset-ring-2",
      )}
    >
      Choose {kind === "schedule" ? "scheduled" : "due"} date…
    </div>
  );
}

type TaskGroupsProps = {
  board: boolean;
  groups: TaskGroup[];
  manual: boolean;
  open: OpenTask;
  reorder: (ids: string[]) => void;
  add: (group?: TaskGroup) => void;
};

function TaskGroups({ board, groups, manual, open, add }: TaskGroupsProps) {
  const { state, today, view, params, grouping, dragSource, groupDropError } =
    useWorkspaceController();
  const aggregate = isAggregateView(view);
  const destinations =
    aggregate && dragSource
      ? emptyGroupTargets(grouping, state, params, today)
      : [];
  const displayed = [
    ...groups,
    ...destinations.filter(
      (g) => !groups.some((existing) => existing.id === g.id),
    ),
  ];
  return (
    <>
      {groupDropError && (
        <Alert>
          <AlertDescription>{groupDropError}</AlertDescription>
        </Alert>
      )}
      <div
        className={cn(
          board &&
            "flex h-full min-h-0 flex-1 items-stretch gap-4 overflow-x-scroll overflow-y-hidden pb-2",
        )}
      >
        {!displayed.length && (
          <Empty className="w-full overflow-y-auto py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Sun />
              </EmptyMedia>
              <EmptyTitle>A little breathing room</EmptyTitle>
              <EmptyDescription>
                No tasks here right now. Add something new or adjust your
                filters.
              </EmptyDescription>
            </EmptyHeader>
            <Button variant="outline" onClick={() => add()}>
              <Plus data-icon="inline-start" />
              Add task
            </Button>
          </Empty>
        )}
        {displayed.map((group) => (
          <TaskGroupSection
            key={group.id}
            board={board}
            group={group}
            manual={manual}
            open={open}
            add={add}
          />
        ))}
        {aggregate &&
          dragSource &&
          (grouping === "schedule" || grouping === "deadline") && (
            <DateGroupTarget kind={grouping} />
          )}
      </div>
    </>
  );
}

/** Renders grouped tasks in the list layout. */
export function TaskList(props: Omit<TaskGroupsProps, "board">) {
  return <TaskGroups {...props} board={false} />;
}

/** Renders grouped tasks as Kanban columns. */
export function KanbanTaskBoard(props: Omit<TaskGroupsProps, "board">) {
  return <TaskGroups {...props} board />;
}
