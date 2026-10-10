"use client";

import {
  ArrowDownAZ,
  ArrowDownWideNarrow,
  ArrowRight,
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarOff,
  ChevronDown,
  ClockArrowDown,
  Flag,
  Folder,
  FolderTree,
  Grid2X2X,
  Layers2,
  LayoutList,
  ListChecks,
  ListOrdered,
  ListTodo,
  type LucideIcon,
  Plus,
  Search,
  SlidersHorizontal,
  Tag,
  Tags,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { TaskCalendarView } from "@/components/calendar/task-calendar";
import {
  KanbanSectionBoard,
  ListSectionGroups,
} from "@/components/sections/task-sections";
import { SectionRemovalDropZone } from "@/components/tasks/task-drag-feedback";
import { KanbanTaskBoard, TaskList } from "@/components/tasks/task-groups";
import { Button } from "@/components/ui/button";
import { Calendar as DatePicker } from "@/components/ui/calendar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspaceController } from "@/contexts/workspace-controller";
import { dateKey, parseDay } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { WorkspaceRoute } from "@/lib/workspace/routes";
import { priorities } from "@/types-and-constants/tasks";

import { WorkspaceContentLoading } from "./workspace-content-loading";
import { WorkspaceFooter } from "./workspace-footer";
import { WorkspaceHeader } from "./workspace-header";

const sortOptions: {
  value: string;
  label: string;
  Icon: LucideIcon;
}[] = [
  { value: "manual", label: "Manual order", Icon: ListOrdered },
  { value: "deadline", label: "Due date", Icon: CalendarClock },
  { value: "schedule", label: "Scheduled date", Icon: CalendarDays },
  { value: "priority", label: "Priority", Icon: Flag },
  { value: "title", label: "Title", Icon: ArrowDownAZ },
  { value: "created", label: "Newest first", Icon: ClockArrowDown },
];

export function WorkspaceView({
  route,
  children,
}: {
  route: WorkspaceRoute;
  children?: ReactNode;
}) {
  const {
    selectedId,
    state,
    tags,
    view,
    params,
    filtersOpen,
    setFiltersOpen,
    setEntity,
    sectioned,
    projectId,
    layout,
    showSections,
    quickTitle,
    setQuickTitle,
    date,
    mode,
    range,
    allTasks,
    displayedTasks,
    displayedGroups,
    visible,
    selectedEntity,
    title,
    collection,
    setParams,
    open,
    create,
    quickAdd,
    reorder,
    activeFilters,
    description,
  } = useWorkspaceController();
  const compact =
    ["inbox", "today", "upcoming", "tasks", "calendar"].includes(view) ||
    !!selectedEntity;
  const selectedSort =
    sortOptions.find(({ value }) => value === params.get("sort")) ??
    sortOptions[0];
  const groupOptions: {
    value: string;
    label: string;
    Icon: LucideIcon;
  }[] = [
    ...(sectioned
      ? [{ value: "sections", label: "Sections", Icon: FolderTree }]
      : []),
    ...(view === "today"
      ? [{ value: "today", label: "Today sections", Icon: Calendar }]
      : []),
    ...(view === "upcoming"
      ? [{ value: "upcoming", label: "Upcoming dates", Icon: CalendarClock }]
      : []),
    { value: "none", label: "No grouping", Icon: Grid2X2X },
    { value: "schedule", label: "Scheduled date", Icon: CalendarDays },
    { value: "deadline", label: "Due date", Icon: CalendarClock },
    { value: "project", label: "Project", Icon: Folder },
    { value: "priority", label: "Priority", Icon: Flag },
    { value: "status", label: "Status", Icon: ListChecks },
  ];
  const defaultGroup = sectioned
    ? "sections"
    : view === "today"
      ? "today"
      : view === "upcoming"
        ? "upcoming"
        : "none";
  const selectedGroupValue = params.get("group") ?? defaultGroup;
  const selectedGroup =
    groupOptions.find(({ value }) => value === selectedGroupValue) ??
    groupOptions.find(({ value }) => value === "none")!;
  const quickAddForm = !showSections &&
    !["archive", "completed"].includes(view) && (
      <form
        className={cn(
          "[&_input]:placeholder:text-muted-foreground [&>span]:text-muted-foreground flex min-w-0 shrink-0 items-center gap-3 rounded-lg px-1 [&_input]:min-w-0 [&_input]:flex-1 [&_input]:bg-transparent [&_input]:text-xs [&_input]:outline-none [&>span]:hidden [&>span]:text-[10px]",
          layout === "board" ? "w-full py-1 sm:w-56" : "py-3 sm:[&>span]:block",
        )}
        onSubmit={(e) => {
          e.preventDefault();
          quickAdd();
        }}
      >
        <Plus className="text-primary size-4" />
        <input
          aria-label="Quick add task"
          placeholder="Add a task…"
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
        />
        {quickTitle ? (
          <Button type="submit" size="sm">
            Add task <ArrowRight data-icon="inline-end" />
          </Button>
        ) : (
          <span>Press Enter to save</span>
        )}
      </form>
    );
  // A retained page must not display another route's content during navigation.
  if (route.view !== view || route.selectedId !== selectedId)
    return <WorkspaceContentLoading />;
  return (
    <div
      className={cn(
        "mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden px-5 pt-5 sm:px-9 lg:px-14",
        view === "calendar" && "max-w-none px-4 max-md:px-3 lg:px-8",
        layout === "board" && "max-w-none",
      )}
    >
      {compact ? (
        <WorkspaceHeader />
      ) : (
        <div className="mb-7 flex shrink-0 items-center justify-between gap-4 [&>button]:shrink-0 [&>div]:min-w-0">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight wrap-anywhere max-md:text-[26px]">
                {title}
              </h1>
            </div>
            <p className="text-muted-foreground mt-2 text-[13px] leading-relaxed max-md:max-w-60 max-md:text-xs">
              {selectedEntity
                ? "One step at a time. Keep things moving."
                : description}
            </p>
          </div>
          <Button
            size="lg"
            onClick={() =>
              collection
                ? setEntity({ kind: view as "projects" | "tags" })
                : create()
            }
          >
            <Plus data-icon="inline-start" />
            {collection
              ? `New ${view === "projects" ? "project" : "tag"}`
              : "Add task"}
          </Button>
        </div>
      )}
      {collection ? (
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      ) : (
        <>
          {view === "search" && (
            <div className="text-muted-foreground mb-6 flex items-center gap-3">
              <Search className="size-5" />
              <Input
                aria-label="Search all tasks"
                autoFocus
                placeholder="Search tasks, notes, projects, and tags…"
                value={params.get("q") ?? ""}
                onChange={(e) => setParams({ q: e.target.value }, true)}
              />
            </div>
          )}
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
            <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b pb-2 text-xs">
              <div className="flex items-center gap-2">
                <LayoutList className="text-muted-foreground size-4" />
                <span>
                  {view === "calendar"
                    ? "Your schedule"
                    : `${visible.length} tasks`}
                </span>
                {view === "upcoming" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setParams({
                        range: String(Math.min(range + 30, 365)),
                      })
                    }
                    disabled={range >= 365}
                  >
                    Next {range} days <Plus data-icon="inline-end" />
                  </Button>
                )}
              </div>
              {layout === "board" && quickAddForm}
              <div className="flex flex-wrap items-center gap-2">
                <CollapsibleTrigger
                  render={
                    <Button
                      variant={
                        filtersOpen || activeFilters.length
                          ? "secondary"
                          : "ghost"
                      }
                      size="sm"
                    />
                  }
                >
                  <SlidersHorizontal data-icon="inline-start" />
                  Filter
                  {activeFilters.length > 0 && ` (${activeFilters.length})`}
                </CollapsibleTrigger>
                {view !== "calendar" && (
                  <>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Sort tasks by ${selectedSort.label}`}
                            className="text-muted-foreground hover:bg-muted gap-1.5 text-xs"
                          />
                        }
                      >
                        <ArrowDownWideNarrow data-icon="inline-start" />
                        <span className="text-foreground">Sort:</span>
                        {selectedSort.label}
                        <ChevronDown data-icon="inline-end" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="min-w-44">
                        <DropdownMenuGroup>
                          <DropdownMenuRadioGroup
                            value={selectedSort.value}
                            onValueChange={(value) =>
                              setParams({ sort: value })
                            }
                          >
                            {sortOptions.map(({ value, label, Icon }) => (
                              <DropdownMenuRadioItem key={value} value={value}>
                                <Icon />
                                {label}
                              </DropdownMenuRadioItem>
                            ))}
                          </DropdownMenuRadioGroup>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {(!sectioned || layout !== "board") && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={`Group tasks by ${selectedGroup.label}`}
                              className="text-muted-foreground hover:bg-muted gap-1.5 text-xs"
                            />
                          }
                        >
                          <Layers2 data-icon="inline-start" />
                          <span className="text-foreground">Group:</span>
                          {selectedGroup.label}
                          <ChevronDown data-icon="inline-end" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="min-w-44">
                          <DropdownMenuGroup>
                            <DropdownMenuRadioGroup
                              value={selectedGroup.value}
                              onValueChange={(value) =>
                                setParams({ group: value })
                              }
                            >
                              {groupOptions.map(({ value, label, Icon }) => (
                                <DropdownMenuRadioItem
                                  key={value}
                                  value={value}
                                >
                                  <Icon />
                                  {label}
                                </DropdownMenuRadioItem>
                              ))}
                            </DropdownMenuRadioGroup>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </>
                )}
              </div>
            </div>
            <CollapsibleContent className="bg-muted/30 mb-3 max-h-[25dvh] shrink-0 overflow-y-auto rounded-xl border p-4">
              <FieldGroup className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <FilterSelect
                  label="Project"
                  value={params.get("project") ?? ""}
                  onChange={(v) => setParams({ project: v })}
                  allIcon={FolderTree}
                  optionIcon={Folder}
                  colorType="entity"
                  options={state.projects.map((p): [string, string, string] => [
                    p.id,
                    p.name,
                    p.color,
                  ])}
                />
                <FilterSelect
                  label="Tag (includes subtags)"
                  value={params.get("tag") ?? ""}
                  onChange={(v) => setParams({ tag: v })}
                  allIcon={Tags}
                  optionIcon={Tag}
                  colorType="entity"
                  options={tags.rows.map(
                    ({ tag: t }): [string, string, string] => [
                      t.id,
                      tags.path(t.id),
                      t.color,
                    ],
                  )}
                />
                <FilterSelect
                  label="Priority"
                  value={params.get("priority") ?? ""}
                  onChange={(v) => setParams({ priority: v })}
                  optionIcon={Flag}
                  colorType="priority"
                  options={priorities.map((p): [string, string, string] => [
                    p,
                    p,
                    p,
                  ])}
                />
                <FilterSelect
                  label="Schedule"
                  value={params.get("scheduled") ?? ""}
                  onChange={(v) => setParams({ scheduled: v })}
                  optionIcons={{ yes: Calendar, no: CalendarOff }}
                  options={[
                    ["yes", "Scheduled"],
                    ["no", "Unscheduled"],
                  ]}
                />
                <Field>
                  <FieldLabel htmlFor="filter-status">Status</FieldLabel>
                  <Select
                    items={[
                      { value: "all", label: "All statuses" },
                      { value: "open", label: "Open" },
                      { value: "completed", label: "Completed" },
                    ]}
                    value={
                      params.get("status") ??
                      (view === "completed"
                        ? "completed"
                        : view === "archive" || view === "search"
                          ? "all"
                          : "open")
                    }
                    onValueChange={(value) => {
                      if (value !== null) setParams({ status: value });
                    }}
                  >
                    <SelectTrigger id="filter-status" className="h-8 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="all">
                          <ListTodo className="size-4 shrink-0" />
                          All statuses
                        </SelectItem>
                        <SelectItem value="open">
                          <LayoutList className="size-4 shrink-0" />
                          Open
                        </SelectItem>
                        <SelectItem value="completed">
                          <ListChecks className="size-4 shrink-0" />
                          Completed
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <DateFilterField
                  id="filter-from"
                  label="Due from"
                  value={params.get("from") ?? ""}
                  onChange={(value) => setParams({ from: value })}
                />
                <DateFilterField
                  id="filter-to"
                  label="Due before"
                  value={params.get("to") ?? ""}
                  onChange={(value) => setParams({ to: value })}
                />
                <div className="flex items-end">
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setParams(
                        Object.fromEntries(activeFilters.map((k) => [k, null])),
                      )
                    }
                  >
                    Clear filters
                  </Button>
                </div>
              </FieldGroup>
            </CollapsibleContent>
          </Collapsible>
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <div
              className={cn(
                "min-h-0 min-w-0 flex-1",
                layout === "board" || view === "calendar"
                  ? "flex flex-col overflow-hidden"
                  : "overflow-y-auto",
              )}
            >
              {view === "calendar" ? (
                <TaskCalendarView
                  tasks={visible}
                  date={date}
                  mode={mode}
                  setParams={setParams}
                  open={open}
                  create={create}
                />
              ) : (
                <>
                  {showSections ? (
                    layout === "board" ? (
                      <KanbanSectionBoard
                        projectId={projectId}
                        tasks={displayedTasks}
                        allTasks={allTasks}
                        manual={(params.get("sort") ?? "manual") === "manual"}
                        open={open}
                        create={(id) => create(undefined, undefined, id)}
                      />
                    ) : (
                      <ListSectionGroups
                        projectId={projectId}
                        tasks={displayedTasks}
                        allTasks={allTasks}
                        manual={(params.get("sort") ?? "manual") === "manual"}
                        open={open}
                        create={(id) => create(undefined, undefined, id)}
                      />
                    )
                  ) : layout === "board" ? (
                    <KanbanTaskBoard
                      groups={displayedGroups}
                      manual={(params.get("sort") ?? "manual") === "manual"}
                      open={open}
                      reorder={reorder}
                      add={() => create()}
                    />
                  ) : (
                    <TaskList
                      groups={displayedGroups}
                      manual={(params.get("sort") ?? "manual") === "manual"}
                      open={open}
                      reorder={reorder}
                      add={() => create()}
                    />
                  )}
                  {layout !== "board" && quickAddForm}
                </>
              )}
            </div>
            {showSections && <SectionRemovalDropZone />}
          </div>
        </>
      )}
      <WorkspaceFooter />
    </div>
  );
}
function DateFilterField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = value ? parseDay(value) : undefined;

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <Input
          id={id}
          type="date"
          className="pr-16 [&::-webkit-calendar-picker-indicator]:opacity-0"
          value={value}
          onChange={(event) => onChange(event.target.value || null)}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute top-1/2 right-1 -translate-y-1/2"
              />
            }
            aria-label={`Choose ${label.toLowerCase()} date`}
            title={`Choose ${label.toLowerCase()} date`}
          >
            <CalendarDays />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto gap-0 p-2">
            <PopoverTitle className="sr-only">
              Choose {label.toLowerCase()} date
            </PopoverTitle>
            <DatePicker
              mode="single"
              selected={selectedDate}
              defaultMonth={selectedDate}
              onSelect={(date) => {
                onChange(date ? dateKey(date) : null);
                setOpen(false);
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-1 w-full justify-center"
              disabled={!value}
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              Clear date
            </Button>
          </PopoverContent>
        </Popover>
      </div>
    </Field>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allIcon: AllIcon,
  optionIcon: OptionIcon,
  optionIcons,
  colorType,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string, string?][];
  allIcon?: LucideIcon;
  optionIcon?: LucideIcon;
  optionIcons?: Record<string, LucideIcon>;
  colorType?: "entity" | "priority";
}) {
  const items = [
    { value: "", label: "All", color: undefined },
    ...options.map(([value, label, color]) => ({ value, label, color })),
  ];
  return (
    <Field>
      <FieldLabel htmlFor={`filter-${label}`}>{label}</FieldLabel>
      <Select
        items={items}
        value={value}
        onValueChange={(value) => {
          if (value !== null) onChange(value);
        }}
      >
        <SelectTrigger id={`filter-${label}`} className="h-8 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => {
              const Icon =
                item.value === ""
                  ? AllIcon
                  : (optionIcons?.[item.value] ?? OptionIcon);
              return (
                <SelectItem key={item.value} value={item.value}>
                  {Icon && (
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        colorType === "entity" && "text-(--entity-color)",
                        colorType === "priority" && "text-(--priority-color)",
                      )}
                      data-color={
                        colorType === "entity" ? item.color : undefined
                      }
                      data-priority={
                        colorType === "priority" ? item.color : undefined
                      }
                    />
                  )}
                  {item.label}
                </SelectItem>
              );
            })}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
