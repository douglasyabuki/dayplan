"use client";

import { SortableKeyboardPlugin } from "@dnd-kit/dom/sortable";
import { useDroppable } from "@dnd-kit/react";
import { useSortable } from "@dnd-kit/react/sortable";
import {
  BetweenHorizontalEnd,
  BetweenHorizontalStart,
  Folder,
  GripVertical,
  Inbox,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import {
  type OpenTask,
  taskCardSensors,
  TaskItem,
  type TaskOpenOptions,
} from "@/components/tasks/task-item";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ItemGroup } from "@/components/ui/item";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/contexts/workspace";
import { useWorkspaceController } from "@/contexts/workspace-controller";
import { previewOrder } from "@/lib/tasks/drag";
import type { Occurrence, Section } from "@/lib/tasks/types";
import { cn } from "@/lib/utils";

import { TaskStatusGroups } from "./task-status-groups";

export function SectionDialog({
  projectId,
  section,
  mode,
  placement,
  close,
}: {
  projectId: string | null;
  section?: Section;
  mode?: "rename" | "delete";
  placement?: { relativeTo: string; side: "left" | "right" };
  close: () => void;
}) {
  const { state, act } = useWorkspace();
  const [name, setName] = useState(section?.name ?? "");
  const [deleting, setDeleting] = useState(mode === "delete");
  const [deleteTasks, setDeleteTasks] = useState(false);
  const [destination, setDestination] = useState("");
  const sections = state.sections
    .filter((s) => s.projectId === projectId && s.id !== section?.id)
    .sort((a, b) => a.order - b.order);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {deleting
              ? `Delete ${section?.name}?`
              : section
                ? mode === "rename"
                  ? "Rename section"
                  : "Manage section"
                : "Add section"}
          </DialogTitle>
          <DialogDescription>
            {deleting
              ? "This includes completed, archived, and filtered-out tasks. Deleting a recurring series also deletes its occurrences. You can undo this action."
              : "Keep related tasks together in List and Kanban views."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (deleting && section) {
              act(
                {
                  type: "deleteSection",
                  id: section.id,
                  destination: destination || null,
                  deleteTasks,
                },
                "Section deleted",
              );
            } else {
              if (!name.trim()) return;
              const id = section?.id ?? crypto.randomUUID();
              const updated: Section = {
                id,
                name: name.trim(),
                projectId,
                order:
                  section?.order ??
                  Math.max(-1, ...sections.map((s) => s.order)) + 1,
              };
              if (placement) {
                const ids = sections.map((item) => item.id);
                const relativeIndex = ids.indexOf(placement.relativeTo);
                if (relativeIndex < 0) return;
                ids.splice(
                  relativeIndex + (placement.side === "right" ? 1 : 0),
                  0,
                  id,
                );
                act(
                  {
                    type: "batch",
                    actions: [
                      { type: "section", section: updated },
                      { type: "reorderSections", projectId, ids },
                    ],
                  },
                  "Section added",
                );
              } else {
                act(
                  { type: "section", section: updated },
                  section ? "Section renamed" : "Section added",
                );
              }
            }
            close();
          }}
        >
          <FieldGroup>
            {deleting ? (
              <FieldSet>
                <FieldLegend>Tasks in this section</FieldLegend>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="radio"
                    name="section-deletion"
                    checked={deleteTasks}
                    onChange={() => setDeleteTasks(true)}
                  />
                  Delete the section and tasks
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="radio"
                    name="section-deletion"
                    checked={!deleteTasks}
                    onChange={() => setDeleteTasks(false)}
                  />
                  Delete the section and move tasks to…
                </label>
                {!deleteTasks && (
                  <Field>
                    <FieldLabel htmlFor="section-destination">
                      Destination section
                    </FieldLabel>
                    <Select
                      items={[
                        { value: "", label: "Unsectioned" },
                        ...sections.map((s) => ({
                          value: s.id,
                          label: s.name,
                        })),
                      ]}
                      value={destination}
                      onValueChange={(value) =>
                        value !== null && setDestination(value)
                      }
                    >
                      <SelectTrigger
                        id="section-destination"
                        className="h-8 w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="">Unsectioned</SelectItem>
                          {sections.map((s) => (
                            <SelectItem value={s.id} key={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </FieldSet>
            ) : (
              <Field>
                <FieldLabel htmlFor="section-name">Section name</FieldLabel>
                <Input
                  id="section-name"
                  autoFocus
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. In progress"
                />
              </Field>
            )}
          </FieldGroup>
          <DialogFooter className="mt-6">
            {section && !deleting && mode !== "rename" && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setDeleting(true)}
              >
                Delete section
              </Button>
            )}
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={deleting ? "destructive" : "default"}
              disabled={!deleting && !name.trim()}
            >
              {deleting ? "Delete" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const sectionMenuClass =
  "w-56 **:data-[slot='dropdown-menu-item']:h-8 **:data-[slot='dropdown-menu-item']:text-[13px] **:data-[slot='dropdown-menu-item']:leading-4 **:data-[slot='dropdown-menu-checkbox-item']:h-8 **:data-[slot='dropdown-menu-checkbox-item']:text-[13px] **:data-[slot='dropdown-menu-checkbox-item']:leading-4 **:data-[slot='dropdown-menu-sub-trigger']:h-8 **:data-[slot='dropdown-menu-sub-trigger']:text-[13px] **:data-[slot='dropdown-menu-sub-trigger']:leading-4 [&_[data-slot='dropdown-menu-item']>svg]:size-3.5 [&_[data-slot='dropdown-menu-checkbox-item']>svg]:size-3.5 [&_[data-slot='dropdown-menu-sub-trigger']>svg]:size-3.5";

function useSectionMenuActions(section: Section) {
  const { state, act } = useWorkspace();
  const { setSectionDialog } = useWorkspaceController();
  const destinations = [
    { id: null, name: "Inbox", Icon: Inbox, color: null },
    ...state.projects.map((project) => ({
      id: project.id,
      name: project.name,
      Icon: Folder,
      color: project.color,
    })),
  ];
  const moveTo = (projectId: string | null) =>
    act({ type: "moveSection", id: section.id, projectId }, "Section moved");
  const actions = [
    {
      label: "Rename",
      Icon: Pencil,
      onSelect: () => setSectionDialog({ section, mode: "rename" }),
    },
    {
      label: "Add Section to Left",
      Icon: BetweenHorizontalEnd,
      onSelect: () =>
        setSectionDialog({
          placement: { relativeTo: section.id, side: "left" },
        }),
    },
    {
      label: "Add Section to Right",
      Icon: BetweenHorizontalStart,
      onSelect: () =>
        setSectionDialog({
          placement: { relativeTo: section.id, side: "right" },
        }),
    },
  ];
  const deleteSection = () => setSectionDialog({ section, mode: "delete" });
  return { actions, deleteSection, destinations, moveTo };
}

function SectionActions({ section }: { section: Section }) {
  const { actions, deleteSection, destinations, moveTo } =
    useSectionMenuActions(section);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Manage ${section.name}`}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="start"
        className={sectionMenuClass}
      >
        <DropdownMenuGroup>
          {actions.map(({ label, Icon, onSelect }) => (
            <DropdownMenuItem key={label} onClick={onSelect}>
              <Icon />
              {label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Folder />
              Move to
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className={sectionMenuClass}>
              <DropdownMenuGroup>
                {destinations.map((destination) => (
                  <DropdownMenuCheckboxItem
                    key={destination.id ?? "inbox"}
                    checked={destination.id === section.projectId}
                    disabled={destination.id === section.projectId}
                    onCheckedChange={(checked) => {
                      if (checked) moveTo(destination.id);
                    }}
                  >
                    <destination.Icon
                      className={
                        destination.color
                          ? "text-(--entity-color)"
                          : "text-muted-foreground"
                      }
                      data-color={destination.color ?? undefined}
                    />
                    {destination.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" onClick={deleteSection}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SectionHeaderMenu({
  section,
  children,
}: {
  section: Section;
  children: React.ReactNode;
}) {
  const { actions, deleteSection, destinations, moveTo } =
    useSectionMenuActions(section);
  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            tabIndex={0}
            data-section-header-menu
            className="flex min-w-0 flex-1 items-center gap-1.25"
            onKeyDown={(event) => {
              if (
                event.key !== "ContextMenu" &&
                !(event.shiftKey && event.key === "F10")
              )
                return;
              event.preventDefault();
              const rect = event.currentTarget.getBoundingClientRect();
              event.currentTarget.dispatchEvent(
                new MouseEvent("contextmenu", {
                  bubbles: true,
                  clientX: rect.left + 16,
                  clientY: rect.top + 16,
                }),
              );
            }}
          />
        }
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuGroup>
          {actions.map(({ label, Icon, onSelect }) => (
            <ContextMenuItem key={label} onClick={onSelect}>
              <Icon />
              {label}
            </ContextMenuItem>
          ))}
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Folder />
              Move to
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuGroup>
                {destinations.map((destination) => (
                  <ContextMenuCheckboxItem
                    key={destination.id ?? "inbox"}
                    checked={destination.id === section.projectId}
                    disabled={destination.id === section.projectId}
                    onCheckedChange={(checked) => {
                      if (checked) moveTo(destination.id);
                    }}
                  >
                    <destination.Icon
                      className={
                        destination.color
                          ? "text-(--entity-color)"
                          : "text-muted-foreground"
                      }
                      data-color={destination.color ?? undefined}
                    />
                    {destination.name}
                  </ContextMenuCheckboxItem>
                ))}
              </ContextMenuGroup>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem variant="destructive" onClick={deleteSection}>
            <Trash2 />
            Delete
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}

type SectionGroupsProps = {
  projectId: string | null;
  tasks: Occurrence[];
  allTasks: Occurrence[];
  board: boolean;
  manual: boolean;
  open: OpenTask;
  create: (sectionId: string | null) => void;
};
function SectionGroups(props: SectionGroupsProps) {
  const { displayedSections, dragDestination, setSectionDialog } =
    useWorkspaceController();
  const sections = previewOrder(
    displayedSections
      .filter((s) => s.projectId === props.projectId)
      .sort((a, b) => a.order - b.order),
    dragDestination?.kind === "section" ? dragDestination : null,
  );

  return (
    <div
      className={cn(
        props.board
          ? "flex h-full min-h-0 max-w-full flex-1 items-stretch gap-4 overflow-x-auto overflow-y-hidden px-0.5 pt-0.5 pb-2"
          : "section-list",
        props.board && "[--section-header-height:2.25rem]",
      )}
      aria-label={props.board ? "Kanban board" : "Task sections"}
    >
      {[null, ...sections].map((section, index) => (
        <SectionColumn
          key={section?.id ?? "unsectioned"}
          {...props}
          section={section}
          index={index - 1}
        />
      ))}
      {props.board && (
        <Button
          variant="outline"
          className="shrink-0 self-start"
          onClick={() => setSectionDialog({})}
        >
          <Plus data-icon="inline-start" />
          Add section
        </Button>
      )}
    </div>
  );
}

function SectionColumn({
  section,
  index,
  ...props
}: SectionGroupsProps & {
  section: Section | null;
  index: number;
}) {
  const sectionId = section?.id ?? null;
  const isUnsectioned = section === null;
  const { ref, isDropTarget } = useDroppable({
    id: `section-target:${sectionId ?? "unsectioned"}`,
    accept: (source) =>
      ["section-task", "row"].includes(String(source.data.kind)),
    collisionPriority: -1,
    data: { kind: "section-target", sectionId },
  });
  const {
    ref: dragRef,
    handleRef,
    isDragging,
  } = useSortable({
    plugins: [SortableKeyboardPlugin],
    id: `section-drag:${sectionId ?? "unsectioned"}`,
    index,
    group: section ? `sections:${props.projectId ?? "inbox"}` : "unsectioned",
    type: "section",
    accept: "section",
    disabled: !section,
    data: { kind: "section", sectionId },
  });
  const tasks = props.tasks.filter((t) => t.sectionId === sectionId);
  const isFilteredToZero =
    isUnsectioned &&
    tasks.length === 0 &&
    props.allTasks.some(
      (task) =>
        task.projectId === props.projectId &&
        task.sectionId === sectionId &&
        !task.archived,
    );
  const taskContent = (
    <ItemGroup className="gap-1.5">
      {isFilteredToZero && (
        <p className="text-muted-foreground px-1 py-3 text-xs">
          No tasks without a section match this view
        </p>
      )}
      <TaskStatusGroups
        tasks={tasks}
        location={{ projectId: props.projectId, sectionId }}
      >
        {(task, index) => (
          <SectionTask
            key={task.id}
            task={task}
            index={index}
            board={props.board}
            open={(options) => props.open(task, options)}
          />
        )}
      </TaskStatusGroups>
    </ItemGroup>
  );
  const addTaskButton = (
    <Button
      variant="ghost"
      className={cn("justify-start", isUnsectioned ? "w-fit" : "w-full")}
      onClick={() => props.create(sectionId)}
    >
      <Plus data-icon="inline-start" />
      Add task
    </Button>
  );
  const sectionHeader = isUnsectioned ? (
    <span className="min-w-0 flex-1 truncate text-sm font-medium">
      Not sectioned
    </span>
  ) : (
    <>
      {section && (
        <button
          ref={handleRef}
          className="text-muted-foreground flex shrink-0 cursor-grab touch-none items-center justify-center"
          aria-label={`Drag section ${section.name}`}
        >
          <GripVertical className="size-4" />
        </button>
      )}
      {props.board ? (
        <CardTitle
          className="min-w-0 flex-1 truncate text-sm font-medium"
          title={section?.name}
          role="heading"
          aria-level={2}
        >
          {section?.name ?? "Unsectioned"}
        </CardTitle>
      ) : (
        <h2
          className="min-w-0 flex-1 truncate text-sm font-medium"
          title={section?.name}
        >
          {section?.name ?? "Unsectioned"}
        </h2>
      )}
    </>
  );
  return (
    <section
      ref={(element) => {
        ref(element);
        // The unsectioned container is only a drop target. Registering it as a
        // disabled draggable marks every child link as aria-disabled too.
        dragRef(section ? element : null);
      }}
      className={cn(
        "relative",
        props.board && "group/section",
        props.board
          ? cn(
              "flex h-full min-h-0 w-75 min-w-0 flex-[0_0_300px] flex-col max-md:w-[min(300px,calc(100vw-56px))] max-md:basis-[min(300px,calc(100vw-56px))]",
            )
          : isUnsectioned
            ? "mb-3 min-w-0 last:mb-0"
            : "mb-4 min-w-0 rounded-lg",
        isDropTarget && "bg-accent/30",
        isDragging && "opacity-30",
      )}
      aria-label={
        isUnsectioned
          ? "Tasks without a section"
          : (section?.name ?? "Unsectioned")
      }
    >
      {props.board ? (
        <Card
          className={cn(
            "bg-muted ring-border min-h-0 flex-1 gap-0 rounded-xl py-0",
            isUnsectioned && "bg-transparent ring-0",
          )}
        >
          <CardHeader className="flex h-[calc(var(--section-header-height)+0.75rem)] shrink-0 flex-row items-center gap-1.25 px-3 pt-3 pb-3">
            {section && (
              <SectionHeaderMenu section={section}>
                {sectionHeader}
                <Badge variant="secondary">{tasks.length}</Badge>
              </SectionHeaderMenu>
            )}
            {isUnsectioned && (
              <>
                {sectionHeader}
                <Badge variant="secondary">{tasks.length}</Badge>
              </>
            )}
            {section && <SectionActions section={section} />}
          </CardHeader>
          <CardContent
            className={cn(
              !isUnsectioned ? "min-h-0 flex-1 p-0" : "min-h-0 p-0",
            )}
          >
            <ScrollArea
              className="h-full min-h-0 px-3 pb-3"
              scrollbarClassName="opacity-0 transition-opacity group-hover/section:opacity-100"
              scrollbarStyle={
                !isUnsectioned ? { insetInlineEnd: 2 } : undefined
              }
            >
              <div className="relative flex flex-col gap-2 *:shrink-0">
                {taskContent}
              </div>
            </ScrollArea>
          </CardContent>
          <CardFooter
            className={cn(
              "justify-start p-3",
              isUnsectioned && "border-t-0 bg-transparent",
            )}
          >
            {addTaskButton}
          </CardFooter>
        </Card>
      ) : (
        <>
          <div
            className={cn(
              "flex min-w-0 shrink-0 items-center gap-1.25 px-1 pb-3",
              !isUnsectioned && "max-w-full",
            )}
          >
            {section && (
              <SectionHeaderMenu section={section}>
                {sectionHeader}
                <Badge variant="secondary">{tasks.length}</Badge>
              </SectionHeaderMenu>
            )}
            {isUnsectioned && (
              <>
                {sectionHeader}
                <Badge variant="secondary">{tasks.length}</Badge>
              </>
            )}
            {section && <SectionActions section={section} />}
          </div>
          <div
            className={cn(
              "relative flex flex-col gap-2",
              !isUnsectioned && "min-h-10 pb-3",
            )}
          >
            {taskContent}
            {addTaskButton}
          </div>
        </>
      )}
    </section>
  );
}

function SectionTask({
  task,
  index,
  board,
  open,
}: {
  task: Occurrence;
  index: number;
  board: boolean;
  open: (options?: TaskOpenOptions) => void;
}) {
  const { state, today, toggle } = useWorkspace();
  const { editorHandle, statusGrouping } = useWorkspaceController();
  const { ref: dragRef, isDragging } = useSortable({
    plugins: [SortableKeyboardPlugin],
    id: `section-task:${task.id}`,
    sensors: taskCardSensors,
    index,
    group: `section-tasks:${task.projectId}:${task.sectionId ?? "unsectioned"}:${statusGrouping ? task.completed : "all"}`,
    type: "section-task",
    accept: ["section-task", "row"],
    collisionPriority: 1,
    disabled: task.archived,
    data: {
      kind: "section-task",
      taskId: task.id,
      sectionId: task.sectionId,
      ...(statusGrouping ? { completed: task.completed } : {}),
    },
  });
  return (
    <TaskItem
      task={task}
      board={board}
      today={today}
      tags={state.tags.filter((tag) => task.tagIds.includes(tag.id))}
      handle={editorHandle}
      onOpen={open}
      onComplete={() => toggle(task)}
      itemRef={dragRef}
      dragging={isDragging}
      movable={!task.archived}
      manual={false}
    />
  );
}

type SectionGroupViewProps = Omit<SectionGroupsProps, "board">;

/** Renders project sections in the list layout. */
export function ListSectionGroups(props: SectionGroupViewProps) {
  return <SectionGroups {...props} board={false} />;
}

/** Renders project sections as a Kanban board. */
export function KanbanSectionBoard(props: SectionGroupViewProps) {
  return <SectionGroups {...props} board />;
}
