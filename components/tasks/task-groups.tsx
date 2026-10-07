"use client";

import { SortableKeyboardPlugin } from "@dnd-kit/dom/sortable";
import { useSortable } from "@dnd-kit/react/sortable";
import { ChevronDown, Plus, Sun } from "lucide-react";
import { useState } from "react";

import {
  type OpenTask,
  taskCardSensors,
  TaskItem,
  type TaskOpenOptions,
} from "@/components/tasks/task-item";
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
import { useWorkspace } from "@/contexts/workspace";
import { useWorkspaceController } from "@/contexts/workspace-controller";
import { formatDate } from "@/lib/tasks/dates";
import type { Occurrence } from "@/lib/tasks/types";
import { cn } from "@/lib/utils";

import { TaskListPreview } from "./task-drag-feedback";

function TaskGroupRow({
  board,
  task,
  group,
  index,
  manual,
  open,
  up,
  down,
}: {
  board: boolean;
  task: Occurrence;
  group: string;
  index: number;
  manual: boolean;
  open: (options?: TaskOpenOptions) => void;
  up?: () => void;
  down?: () => void;
}) {
  const { state, today, toggle } = useWorkspace();
  const { editorHandle, view } = useWorkspaceController();
  const { ref, isDragging } = useSortable({
    sensors: taskCardSensors,
    plugins: [SortableKeyboardPlugin],
    id: `row:${group}:${task.id}`,
    index,
    group,
    type: "row",
    accept: ["row", "section-task"],
    disabled: task.archived,
    data: { taskId: task.id, kind: "row", group },
  });
  const project =
    view === "projects" || view === "inbox"
      ? undefined
      : state.projects.find((p) => p.id === task.projectId);
  return (
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
      up={up}
      down={down}
    />
  );
}

function TaskGroup({
  board,
  label,
  tasks,
  manual,
  open,
  reorder,
}: {
  board: boolean;
  label: string;
  tasks: Occurrence[];
  manual: boolean;
  open: OpenTask;
  reorder: (ids: string[]) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const formatted = /^\d{4}-\d{2}-\d{2}$/.test(label)
    ? formatDate(label, { weekday: "long", month: "short", day: "numeric" })
    : label;
  function move(index: number, direction: number) {
    const ids = tasks.map((t) => t.id);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    reorder(ids);
  }
  const rows = !collapsed && (
    <TaskListPreview tasks={tasks}>
      {(task, index) => (
        <TaskGroupRow
          board={board}
          key={`${label}-${task.id}`}
          task={task}
          group={label}
          index={index}
          manual={manual}
          open={(options) => open(task, options)}
          up={index ? () => move(index, -1) : undefined}
          down={index < tasks.length - 1 ? () => move(index, 1) : undefined}
        />
      )}
    </TaskListPreview>
  );
  return (
    <section
      className={cn(
        board
          ? "bg-muted/35 flex h-full min-h-0 w-80 shrink-0 flex-col rounded-xl border max-md:w-[min(300px,calc(100vw-56px))]"
          : "mb-8",
      )}
    >
      <button
        className={cn(
          "section-heading mb-2 flex shrink-0 items-center gap-2 text-xs font-medium",
          board && "px-3 pt-3",
          label === "Overdue" && "text-destructive",
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
      {board ? (
        <ScrollArea className="min-h-0 flex-1 px-3 pb-3">
          <ItemGroup className="gap-1.5">{rows}</ItemGroup>
        </ScrollArea>
      ) : (
        <ItemGroup className="gap-1.5">{rows}</ItemGroup>
      )}
    </section>
  );
}

type TaskGroupsProps = {
  board: boolean;
  groups: [string, Occurrence[]][];
  manual: boolean;
  open: OpenTask;
  reorder: (ids: string[]) => void;
  add: () => void;
};

function TaskGroups({
  board,
  groups,
  manual,
  open,
  reorder,
  add,
}: TaskGroupsProps) {
  return (
    <div
      className={cn(
        board &&
          "flex h-full min-h-0 flex-1 items-stretch gap-4 overflow-x-auto overflow-y-hidden pb-2",
      )}
    >
      {!groups.length && (
        <Empty className="w-full overflow-y-auto py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Sun />
            </EmptyMedia>
            <EmptyTitle>A little breathing room</EmptyTitle>
            <EmptyDescription>
              No tasks here right now. Add something new or adjust your filters.
            </EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" onClick={add}>
            <Plus data-icon="inline-start" />
            Add a task
          </Button>
        </Empty>
      )}
      {groups.map(([label, tasks]) => (
        <TaskGroup
          board={board}
          key={label}
          label={label}
          tasks={tasks}
          manual={manual}
          open={open}
          reorder={reorder}
        />
      ))}
    </div>
  );
}

type TaskGroupViewProps = Omit<TaskGroupsProps, "board">;

/** Renders grouped tasks in the list layout. */
export function TaskList(props: TaskGroupViewProps) {
  return <TaskGroups {...props} board={false} />;
}

/** Renders grouped tasks as Kanban columns. */
export function KanbanTaskBoard(props: TaskGroupViewProps) {
  return <TaskGroups {...props} board />;
}
