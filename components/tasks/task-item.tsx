"use client";

import { KeyboardSensor, PointerSensor } from "@dnd-kit/dom";
import { SortableKeyboardPlugin } from "@dnd-kit/dom/sortable";
import { useDroppable } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CalendarX,
  ChevronDown,
  Flag,
  IndentDecrease,
  IndentIncrease,
  Repeat2,
} from "lucide-react";
import { type ComponentProps, type Ref, useId, useRef, useState } from "react";

import { TagBadge } from "@/components/collections/tag-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { PopoverTrigger } from "@/components/ui/popover";
import { useWorkspace } from "@/contexts/workspace";
import { useWorkspaceController } from "@/contexts/workspace-controller";
import { taskIndex } from "@/lib/tasks/hierarchy";
import {
  compactTiming,
  deadlineLabel,
  scheduleLabel,
} from "@/lib/tasks/presentation";
import {
  occurrenceChildren,
  occurrenceParent,
  reference,
  referenceKey,
} from "@/lib/tasks/recurrence";
import {
  type Occurrence,
  priorities,
  type Priority,
  type Project,
  type Tag,
} from "@/lib/tasks/types";
import { cn } from "@/lib/utils";

import { TaskListPreview } from "./task-drag-feedback";

export type TaskOpenOptions = { triggerId?: string };
export type OpenTask = (task: Occurrence, options?: TaskOpenOptions) => void;

// Titles remain clickable, but can also start a drag after the sensor threshold.
// Other interactive descendants retain the library's activation protection.
export const taskCardSensors = [
  PointerSensor.configure({
    preventActivation(event, source) {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-task-item]") !== source.element
      )
        return true;
      if (
        event.target instanceof Element &&
        event.target.closest(".task-title")
      ) {
        return false;
      }
      return PointerSensor.defaults.preventActivation?.(event, source) ?? false;
    },
  }),
  KeyboardSensor,
];

export function TaskCheckbox({
  priority = "none",
  className,
  ...props
}: ComponentProps<typeof Checkbox> & { priority?: Priority }) {
  return (
    <Checkbox
      {...props}
      className={cn(
        "not-data-checked:border-[color-mix(in_oklch,var(--priority-color)_70%,var(--muted-foreground))]",
        className,
      )}
      data-priority={priority}
      data-task-checkbox
    />
  );
}

/** Shared presentation only: adapters own persistence, sorting and drag registration. */
export function TaskItem({
  task,
  board,
  today,
  project,
  tags,
  onOpen,
  onComplete,
  handle,
  itemRef,
  dragging,
  movable,
  depth = 0,
}: {
  task: Occurrence;
  board: boolean;
  today: string;
  project?: Project;
  tags: Tag[];
  onOpen: (options?: TaskOpenOptions) => void;
  onComplete: () => void;
  handle: ComponentProps<typeof PopoverTrigger>["handle"];
  itemRef?: Ref<HTMLDivElement>;
  dragging?: boolean;
  movable?: boolean;
  manual: boolean;
  up?: () => void;
  down?: () => void;
  /** Visual nesting: roots are 0; each rendered child increments by 1. */
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const triggerId = useId();
  const childrenId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { state } = useWorkspace();
  const controller = useWorkspaceController();
  const hierarchical = ["inbox", "projects", "tasks"].includes(controller.view);
  const allChildren = occurrenceChildren(state, task, controller.allTasks);
  const visibleChildren = hierarchical
    ? allChildren.filter((t) =>
        controller.hierarchyTasks.some((v) => v.id === t.id),
      )
    : allChildren;
  const children = visibleChildren;
  const parentRef = occurrenceParent(state, task);
  const siblings = controller.allTasks
    .filter((t) => {
      const p = occurrenceParent(state, t);
      return parentRef
        ? !!p && referenceKey(p) === referenceKey(parentRef)
        : !p &&
            !t.parentId &&
            t.projectId === task.projectId &&
            t.sectionId === task.sectionId;
    })
    .sort((a, b) => a.order - b.order);
  const siblingIndex = siblings.findIndex((t) => t.id === task.id);
  const canReorder =
    hierarchical &&
    (!!parentRef || (controller.params.get("sort") ?? "manual") === "manual") &&
    siblings.every((t) => controller.hierarchyTasks.some((v) => v.id === t.id));
  const moveSibling = (direction: number) => {
    const target = siblings[siblingIndex + direction];
    if (!target || !canReorder) return;
    controller.act(
      {
        type: "moveTask",
        task,
        parentRef,
        projectId: task.projectId,
        sectionId: task.sectionId,
        tasks: controller.allTasks,
        beforeId: direction < 0 ? target.id : siblings[siblingIndex + 2]?.id,
      },
      "Task moved",
    );
  };
  const previous = siblingIndex > 0 ? siblings[siblingIndex - 1] : undefined;
  const indent =
    previous && canReorder
      ? () =>
          controller.act(
            {
              type: "moveTask",
              task,
              parentRef: reference(previous),
              projectId: previous.projectId,
              sectionId: previous.sectionId,
              tasks: controller.allTasks,
            },
            "Task nested",
          )
      : undefined;
  const outdent = parentRef
    ? () => {
        const parent = controller.allTasks.find(
          (t) => t.id === referenceKey(parentRef),
        );
        if (parent)
          controller.act(
            {
              type: "moveTask",
              task,
              parentRef: occurrenceParent(state, parent),
              projectId: parent.projectId,
              sectionId: parent.sectionId,
              tasks: controller.allTasks,
            },
            "Task detached",
          );
      }
    : undefined;
  const complete = allChildren.filter((item) => item.completed).length;
  const inside =
    controller.dragDestination?.kind === "task" &&
    controller.dragDestination.intent === "inside" &&
    controller.dragDestination.targetId === task.id;
  const receiving =
    controller.dragDestination?.kind === "task" &&
    controller.dragDestination.intent !== "inside" &&
    !!controller.dragDestination.parentRef &&
    referenceKey(controller.dragDestination.parentRef) === task.id;
  const { ref: childrenDropRef } = useDroppable({
    id: `task-children:${task.id}`,
    accept: ["section-task", "row"],
    collisionPriority: depth + 1.5,
    disabled: task.archived,
    data: { kind: "task-children", taskId: task.id, sectionId: task.sectionId },
  });
  const ancestry = taskIndex(state.tasks).ancestors(task.taskId).reverse();
  const timing = compactTiming(task.schedule, task.deadline, today);
  const hasActions = !task.archived || task.priority !== "none";
  const subtasksToggle = children.length > 0 && (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className="w-fit group-data-board/item:px-0.75 group-data-board/item:text-[11px] group-data-board/item:font-normal group-data-board/item:has-data-[icon=inline-start]:pl-0.75"
      aria-expanded={expanded || receiving}
      aria-controls={childrenId}
      onClick={(event) => {
        event.stopPropagation();
        setExpanded(!expanded);
      }}
    >
      <ChevronDown
        data-icon="inline-start"
        className={cn(!expanded && "-rotate-90")}
      />
      {complete}/{allChildren.length} subtasks
    </Button>
  );
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <Item
            ref={itemRef}
            role="listitem"
            variant={board ? "outline" : "default"}
            size="xs"
            data-task-item
            data-task-ref={task.id}
            data-depth={depth}
            data-board={board || undefined}
            data-movable={movable || undefined}
            data-completed={task.completed || undefined}
            className={cn(
              "not-has-[[data-task-item]:hover]:hover:bg-muted data-[variant=outline]:bg-background data-[variant=outline]:not-has-[[data-task-item]:hover]:hover:bg-accent relative cursor-pointer items-start select-none data-board:grid data-board:grid-cols-[24px_minmax(0,1fr)_auto] data-board:gap-x-1 data-board:gap-y-0.5 data-board:p-2",
              depth >= 4 && "data-board:border-0 data-board:px-0",
              dragging && "cursor-grabbing opacity-30",
              inside && "isolate",
            )}
            onClick={(event) => {
              event.stopPropagation();
              if (event.defaultPrevented) return;
              if (
                !(event.target as HTMLElement).closest(
                  "button,input,a,[role=checkbox],[role=menuitem]",
                )
              )
                triggerRef.current?.click();
            }}
          >
            <ItemMedia className="translate-none gap-0.5 pt-0.5 group-data-board/item:col-start-1 group-data-board/item:row-start-1 group-data-board/item:row-end-3 group-data-board/item:flex-col group-data-board/item:gap-1 group-data-board/item:pt-1">
              <TaskCheckbox
                priority={task.priority}
                checked={task.completed}
                className="after:inset-x-0"
                onCheckedChange={onComplete}
                aria-label={`${task.completed ? "Reopen" : "Complete"} ${task.title}`}
              />
            </ItemMedia>
            <ItemContent
              className={cn(
                "min-w-0 gap-0.5 group-data-board/item:col-start-2 group-data-board/item:row-start-1",
                !hasActions && "group-data-board/item:-col-end-1",
              )}
            >
              {ancestry.length > 0 &&
                (!hierarchical ||
                  depth >= 4 ||
                  !occurrenceParent(state, task)) && (
                  <p
                    className="text-muted-foreground truncate text-xs"
                    title={ancestry.map((t) => t.title).join(" / ")}
                  >
                    {ancestry.map((t) => t.title).join(" / ")}
                  </p>
                )}
              <ItemTitle
                className="w-full leading-4.5 group-data-board/item:overflow-visible"
                // Shrink one pixel per level, with a readable 12px floor (in rem).
                style={{
                  fontSize: `${Math.max(12, 14 - Math.max(0, depth)) / 16}rem`,
                }}
              >
                <PopoverTrigger
                  ref={triggerRef}
                  id={triggerId}
                  handle={handle}
                  onClick={(event) => {
                    if (!event.defaultPrevented) onOpen({ triggerId });
                  }}
                  className={cn(
                    "task-title group-data-completed/item:text-muted-foreground min-w-0 flex-1 cursor-pointer text-left outline-none group-data-board/item:min-h-6 group-data-completed/item:line-through focus-visible:underline",
                    dragging && "cursor-grabbing",
                    depth >= 1
                      ? "truncate"
                      : "wrap-break-word group-data-board/item:line-clamp-2 group-data-board/item:wrap-anywhere",
                  )}
                  title={depth >= 1 ? task.title : undefined}
                  aria-label={`Edit ${task.title}`}
                >
                  {task.title}
                </PopoverTrigger>
              </ItemTitle>
              {!board && task.description && (
                <ItemDescription className="text-xs leading-4">
                  {task.description}
                </ItemDescription>
              )}
              {!board &&
                (task.deadline ||
                  task.schedule ||
                  task.recurrence ||
                  project) && (
                  <div className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] leading-4 wrap-anywhere [&_svg]:size-3">
                    {task.deadline && (
                      <span
                        data-overdue={
                          (!task.completed && task.deadline.date < today) ||
                          undefined
                        }
                        className="data-overdue:text-destructive flex items-center gap-1"
                      >
                        <CalendarX className="shrink-0" aria-hidden="true" />
                        {deadlineLabel(task.deadline, today)}
                      </span>
                    )}
                    {task.schedule && (
                      <span className="flex items-center gap-1">
                        <CalendarDays className="shrink-0" aria-hidden="true" />
                        {scheduleLabel(task.schedule, today)}
                      </span>
                    )}
                    {task.recurrence && <Repeat2 aria-label="Recurring task" />}
                    {project && <span>{project.name}</span>}
                  </div>
                )}
              {!board && tags.length > 0 && (
                <div
                  className="flex min-w-0 flex-wrap items-center gap-1"
                  aria-label="Tags"
                >
                  {tags.map((tag) => (
                    <TagBadge key={tag.id} tag={tag} compact />
                  ))}
                </div>
              )}
              {!board && subtasksToggle}
            </ItemContent>
            {hasActions && (
              <ItemActions className="group-data-board/item:col-start-3 group-data-board/item:row-start-1 group-data-board/item:min-h-6 group-data-board/item:gap-0.5">
                {task.priority !== "none" && (
                  <Flag
                    className="size-3.5 text-(--priority-color)"
                    data-priority={task.priority}
                    aria-label={`${task.priority} priority`}
                  />
                )}
              </ItemActions>
            )}
            {board &&
              (timing.scheduled ||
                timing.due ||
                task.recurrence ||
                project ||
                tags.length > 0 ||
                subtasksToggle) && (
                <ItemFooter className="text-muted-foreground col-start-2 -col-end-1 row-start-2 min-w-0 flex-col items-stretch gap-0.5 text-[11px] leading-4">
                  {(timing.scheduled || timing.due || task.recurrence) && (
                    <div className="text-muted-foreground text-[11px] leading-4 wrap-anywhere [&_svg]:size-3 [&_svg]:align-[-2px]">
                      {timing.scheduled && (
                        <span className={cn(depth >= 1 && "block")}>
                          <CalendarDays
                            className="mr-1 inline-block"
                            aria-hidden="true"
                          />
                          <span className="sr-only">Scheduled </span>
                          {timing.scheduled}
                        </span>
                      )}
                      {depth === 0 && timing.scheduled && timing.due && (
                        <span aria-hidden="true"> · </span>
                      )}
                      {timing.due && (
                        <span
                          data-overdue={
                            (!task.completed && task.deadline!.date < today) ||
                            undefined
                          }
                          className={cn(
                            "data-overdue:text-destructive",
                            depth >= 1 && "block",
                          )}
                        >
                          <CalendarX
                            className="mr-1 inline-block"
                            aria-hidden="true"
                          />
                          {depth >= 1 && task.deadline
                            ? deadlineLabel(task.deadline, today)
                            : timing.due}
                        </span>
                      )}
                      {task.recurrence && (
                        <Repeat2
                          className="ml-1 inline-block"
                          aria-label="Recurring task"
                        />
                      )}
                    </div>
                  )}
                  {(project || tags.length > 0) && (
                    <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
                      <div className="flex min-w-0 flex-[1_1_100px] items-center gap-0.75">
                        {project && (
                          <span
                            className="max-w-[40%] min-w-0 flex-[0_1_auto] truncate"
                            title={project.name}
                          >
                            {project.name}
                          </span>
                        )}
                        {tags.slice(0, 2).map((tag) => (
                          <TagBadge key={tag.id} tag={tag} compact />
                        ))}
                        {tags.length > 2 && (
                          <Button
                            variant="ghost"
                            size="xs"
                            className="px-0.75 text-[11px] font-normal"
                            aria-label={`Show all ${tags.length} tags for ${task.title}`}
                            onClick={() => triggerRef.current?.click()}
                          >
                            +{tags.length - 2}
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                  {subtasksToggle && (
                    <div className="flex min-w-0">{subtasksToggle}</div>
                  )}
                </ItemFooter>
              )}
            {inside && (
              <div
                role="status"
                className="bg-background/85 text-primary inset-ring-primary pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 overflow-hidden rounded-[inherit] px-3 py-1 text-xs font-medium inset-ring-2 backdrop-blur-[2px]"
              >
                <IndentIncrease
                  className="size-4 shrink-0"
                  aria-hidden="true"
                />
                <span className="truncate">Make subtask of {task.title}</span>
              </div>
            )}
            {(expanded || receiving) && (
              <ItemFooter
                ref={childrenDropRef}
                id={childrenId}
                className={cn(
                  "col-start-1 -col-end-1 min-w-0 basis-full flex-col items-stretch gap-1 pt-1",
                  depth < 4 && (board ? "pl-4" : "pl-14"),
                )}
              >
                <TaskListPreview
                  tasks={children}
                  location={{
                    parentRef: reference(task),
                    projectId: task.projectId,
                    sectionId: task.sectionId,
                  }}
                >
                  {(item, index) => (
                    <NestedTaskRow
                      key={item.id}
                      task={item}
                      index={index}
                      depth={depth + 1}
                      board={board}
                    />
                  )}
                </TaskListPreview>
              </ItemFooter>
            )}
          </Item>
        }
      />
      {!task.archived && (
        <ContextMenuContent
          className="w-50 **:data-[slot='context-menu-item']:text-[13px] **:data-[slot='context-menu-item']:leading-4 [&_[data-slot='context-menu-item']>svg]:size-3.5"
          onClick={(event) => event.stopPropagation()}
        >
          <ContextMenuGroup>
            <ContextMenuLabel>Priority</ContextMenuLabel>
            <ContextMenuRadioGroup
              value={task.priority}
              onValueChange={(value) =>
                controller.act(
                  {
                    type: "occurrence",
                    task: { ...task, priority: value as Priority },
                  },
                  "Priority updated",
                )
              }
              className="flex justify-between gap-1 px-1 py-1"
            >
              {[...priorities].reverse().map((priority) => (
                <ContextMenuRadioItem
                  key={priority}
                  value={priority}
                  aria-label={`${priority[0].toUpperCase()}${priority.slice(1)} priority`}
                  title={`${priority[0].toUpperCase()}${priority.slice(1)} priority`}
                  className="data-checked:bg-accent data-checked:text-accent-foreground size-8 justify-center p-0 [&>span]:hidden"
                >
                  <Flag
                    className="text-(--priority-color)"
                    data-priority={priority}
                    aria-hidden="true"
                  />
                </ContextMenuRadioItem>
              ))}
            </ContextMenuRadioGroup>
          </ContextMenuGroup>
          <ContextMenuSeparator />
          <ContextMenuGroup>
            <ContextMenuItem
              disabled={!canReorder || siblingIndex <= 0}
              onClick={() => moveSibling(-1)}
            >
              <ArrowUp />
              Move up
            </ContextMenuItem>
            <ContextMenuItem
              disabled={!canReorder || siblingIndex >= siblings.length - 1}
              onClick={() => moveSibling(1)}
            >
              <ArrowDown />
              Move down
            </ContextMenuItem>
            <ContextMenuItem disabled={!indent} onClick={indent}>
              <IndentIncrease />
              Make subtask of previous task
            </ContextMenuItem>
            <ContextMenuItem disabled={!outdent} onClick={outdent}>
              <IndentDecrease />
              Move out of parent
            </ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      )}
    </ContextMenu>
  );
}

function NestedTaskRow({
  task,
  index,
  depth,
  board,
}: {
  task: Occurrence;
  index: number;
  depth: number;
  board: boolean;
}) {
  const { state, today, toggle } = useWorkspace();
  const controller = useWorkspaceController();
  const parent = occurrenceParent(state, task);
  const { ref, isDragging } = useSortable({
    // Keep React as the sole owner of the nested DOM. The default optimistic
    // plugin reparents DOM nodes behind React during cross-group hovers.
    plugins: [SortableKeyboardPlugin],
    sensors: taskCardSensors,
    id: `nested:${task.id}`,
    index,
    group: `children:${parent ? referenceKey(parent) : task.parentId}`,
    collisionPriority: depth + 1,
    type: "section-task",
    accept: ["section-task", "row"],
    data: { kind: "section-task", taskId: task.id, sectionId: task.sectionId },
    disabled: task.archived,
  });
  return (
    <TaskItem
      task={task}
      board={board}
      depth={depth}
      today={today}
      tags={state.tags.filter((t) => task.tagIds.includes(t.id))}
      handle={controller.editorHandle}
      onOpen={(options) => controller.open(task, options)}
      onComplete={() => toggle(task)}
      itemRef={ref}
      dragging={isDragging}
      movable={!task.archived}
      manual={false}
    />
  );
}
