"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type { DragEndEvent, DragMoveEvent } from "@dnd-kit/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  type ReactNode,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { TaskOpenOptions } from "@/components/tasks/task-item";
import {
  type QuickActionKind,
  TaskQuickActionPopover,
} from "@/components/tasks/task-quick-actions";
import { useWorkspace } from "@/contexts/workspace";
import { addDays, parseDay } from "@/lib/tasks/dates";
import {
  type DragDestination,
  dragDestination as resolveDragDestination,
  taskPointerIntent,
} from "@/lib/tasks/drag";
import { taskDropAction } from "@/lib/tasks/operations";
import {
  asOccurrence,
  expandTasks,
  occurrenceParent,
  parseReference,
  referenceKey,
  resolveOccurrence,
} from "@/lib/tasks/recurrence";
import {
  resolveWorkspaceRoute,
  workspaceHref,
  workspaceQueryHref,
  type WorkspaceViewName,
} from "@/lib/tasks/routes";
import { newTask } from "@/lib/tasks/seed";
import { groupTasks, selectTasks } from "@/lib/tasks/selectors";
import {
  containerKey,
  type Occurrence,
  type Project,
  type Section,
} from "@/lib/tasks/types";

const titles: Record<WorkspaceViewName, string> = {
  today: "Today",
  inbox: "Inbox",
  upcoming: "Upcoming",
  tasks: "All tasks",
  calendar: "Calendar",
  search: "Search",
  completed: "Completed",
  archive: "Archive",
  projects: "Projects",
  tags: "Tags",
};
const descriptions: Record<WorkspaceViewName, string> = {
  today: "A fresh start. A little focus. A day well spent.",
  inbox: "Get it out of your head. Give it a home later.",
  upcoming: "A little perspective on what’s ahead.",
  tasks: "Everything on your mind, all in one place.",
  calendar: "Make time for what matters.",
  search: "Find that thing you were thinking about.",
  completed: "Small steps. Real progress.",
  archive: "Out of the way, here when you need it.",
  projects: "Give your ideas a place to grow.",
  tags: "Small connections. A clearer picture.",
};

function useControllerState() {
  const { state, today, save, act, reset, storageError } = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeKey = pathname + "?" + searchParams.toString();
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
  const route = resolveWorkspaceRoute(pathname) ?? { view: "today" as const };
  const { view, selectedId } = route;
  const params = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams],
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [settings, setSettings] = useState(false);
  const [entity, setEntity] = useState<{
    kind: "projects" | "tags";
    entity?: Project;
  } | null>(null);
  const [sectionDialog, setSectionDialog] = useState<{
    section?: Section;
    mode?: "rename" | "delete";
    placement?: { relativeTo: string; side: "left" | "right" };
  } | null>(null);
  const sectioned = view === "inbox" || (view === "projects" && !!selectedId);
  const hasLayout = sectioned || ["today", "upcoming", "tasks"].includes(view);
  const projectId = view === "projects" ? (selectedId ?? null) : null;
  const layout = hasLayout
    ? (state.layouts[sectioned ? containerKey(projectId) : `view:${view}`] ??
      "list")
    : "list";
  const showSections =
    sectioned &&
    (layout === "board" || (params.get("group") ?? "sections") === "sections");
  const [quickTitle, setQuickTitle] = useState("");
  const [editorHandle] = useState(() => PopoverPrimitive.createHandle());
  const [editorOrigin, setEditorOrigin] = useState<
    (TaskOpenOptions & { taskId: string }) | null
  >(null);
  const editorGuardRef = useRef<((action: () => void) => void) | null>(null);
  const [newDraft, setNewDraft] = useState<Occurrence | null>(null);
  const date =
    /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "") &&
    !Number.isNaN(parseDay(params.get("date")!).getTime())
      ? params.get("date")!
      : today;
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const media = matchMedia("(max-width: 767px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const mode = ["day", "week", "month"].includes(params.get("mode") ?? "")
    ? params.get("mode")!
    : mobile
      ? "day"
      : "week";
  const range = Math.max(30, Math.min(365, Number(params.get("range")) || 30));
  const anchors = state.tasks
    .filter((t) => t.recurrence)
    .map((t) => t.schedule?.date ?? t.deadline?.date ?? today);
  const from = [...anchors, addDays(date, -42), today].sort()[0];
  const to = [addDays(date, 45), addDays(today, range)].sort().at(-1)!;
  const allTasks = useMemo(
    () => expandTasks(state, from, to),
    [state, from, to],
  );
  const matches = selectTasks(allTasks, state, view, selectedId, params, today);
  const hierarchyView = ["inbox", "projects", "tasks"].includes(view);
  const included = new Map(matches.map((t) => [t.id, t]));
  if (hierarchyView)
    for (const match of matches) {
      let current = match;
      const seen = new Set<string>();
      while (!seen.has(current.id)) {
        seen.add(current.id);
        const ref = occurrenceParent(state, current);
        const parent = ref ? resolveOccurrence(state, ref) : undefined;
        if (!parent) break;
        included.set(parent.id, parent);
        current = parent;
      }
    }
  const visible = hierarchyView
    ? [...included.values()].filter((t) => {
        const p = occurrenceParent(state, t);
        return !p || !included.has(referenceKey(p));
      })
    : matches;
  const groups = groupTasks(visible, state, view, params, today);
  const selectedEntity =
    view === "projects"
      ? state.projects.find((p) => p.id === selectedId)
      : view === "tags"
        ? state.tags.find((t) => t.id === selectedId)
        : undefined;
  const title = selectedEntity?.name ?? titles[view] ?? "Today";
  const collection = (view === "projects" || view === "tags") && !selectedId;
  const selectedTaskId = params.get("task");
  const fallbackNewTask = asOccurrence(newTask());
  let selectedTask = allTasks.find((t) => t.id === selectedTaskId);
  if (!selectedTask && selectedTaskId) {
    const ref = parseReference(selectedTaskId);
    if (ref) selectedTask = resolveOccurrence(state, ref);
  }
  function setParams(changes: Record<string, string | null>, replace = false) {
    const url = workspaceQueryHref(pathname, params, changes);
    if (replace) router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
  }
  function open(task: Occurrence, options?: TaskOpenOptions) {
    closeTaskActions();
    const action = () =>
      startTransition(() => {
        setEditorOrigin({ ...options, taskId: task.id });
        setNewDraft(null);
        setParams({ task: task.id });
      });
    if (editorGuardRef.current && selectedTaskId !== task.id)
      editorGuardRef.current(action);
    else action();
  }
  function create(
    day?: string,
    time?: string,
    sectionId: string | null = null,
  ) {
    closeTaskActions();
    const action = () =>
      startTransition(() => {
        setEditorOrigin(null);
        const task = newTask(
          "",
          view === "projects" ? (selectedId ?? null) : null,
        );
        task.sectionId = sectionId;
        if (view === "tags" && selectedId) task.tagIds = [selectedId];
        if (day) task.schedule = { date: day, time, duration: 30 };
        else if (view === "today")
          task.schedule = { date: today, duration: 30 };
        setNewDraft(asOccurrence(task));
        setParams({ task: "new" });
      });
    if (editorGuardRef.current) editorGuardRef.current(action);
    else action();
  }
  function closeEditor() {
    startTransition(() => {
      setEditorOrigin(null);
      setNewDraft(null);
      setParams({ task: null });
    });
  }
  function quickAdd() {
    if (!quickTitle.trim()) return;
    const task = newTask(
      quickTitle.trim(),
      view === "projects" ? (selectedId ?? null) : null,
    );
    if (view === "today") task.schedule = { date: today, duration: 30 };
    if (view === "tags" && selectedId) task.tagIds = [selectedId];
    act({ type: "save", task }, "Task added");
    setQuickTitle("");
  }
  function reorder(ids: string[]) {
    act({ type: "reorderTasks", tasks: allTasks, ids }, "Task order updated");
  }
  const [dragDestination, setDragDestination] =
    useState<DragDestination | null>(null);
  const [dragSnapshot, setDragSnapshot] = useState<HTMLElement | null>(null);
  const [dragSource, setDragSource] = useState<Occurrence | null>(null);
  const [statusCollapsed, setStatusCollapsed] = useState<
    Record<string, boolean>
  >({});
  const statusGrouping =
    showSections && (params.get("status") ?? "open") === "all";
  const [taskExpanded, setTaskExpanded] = useState<Record<string, boolean>>({});

  const dragDraft = useRef<{
    sourceId: string | null;
    destination: DragDestination | null;
  }>({ sourceId: null, destination: null });
  // Lists preview sibling order locally, preserving the active source's parent.
  const displayedTasks = visible;
  const displayedGroups = groupTasks(
    displayedTasks,
    state,
    view,
    params,
    today,
  );
  const displayedSections = state.sections;

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
      visible: hierarchyView ? [...included.values()] : matches,
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
    const keepHoveredGroup = hoveredKey === statusHover.current?.key;
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
    const destination = event.canceled
      ? null
      : (destinationFor(event) ?? dragDraft.current.destination);
    const { source, target } = event.operation;
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest(
        'input,textarea,select,[role="combobox"],[contenteditable="true"],[role="dialog"]',
      );
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        router.push(workspaceHref({ view: "search" }));
      } else if (
        !typing &&
        !e.metaKey &&
        !e.ctrlKey &&
        e.key.toLowerCase() === "n"
      ) {
        e.preventDefault();
        create();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  const sidebarProps = {
    view,
    selectedId,
    tasks: allTasks.filter(
      (t) => !t.context?.occurrenceDate || t.context?.occurrenceDate <= today,
    ),
    add: () => create(),
    manage: (kind: "projects" | "tags", item?: Project) =>
      setEntity({ kind, entity: item }),
  };
  const completedToday = allTasks.filter(
    (t) =>
      !t.archived &&
      t.completed &&
      (t.schedule?.date === today || t.deadline?.date === today),
  ).length;
  const todayTotal = allTasks.filter(
    (t) =>
      !t.archived && (t.schedule?.date === today || t.deadline?.date === today),
  ).length;
  const activeFilters = [
    "project",
    "tag",
    "priority",
    "scheduled",
    "from",
    "to",
    "status",
  ].filter((k) => params.get(k));

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
    state,
    today,
    dragDestination,
    statusGrouping,
    statusCollapsed,
    setStatusCollapsed,
    taskExpanded,
    setTaskExpanded,
    act,
    reset,
    storageError,
    view,
    selectedId,
    params,
    filtersOpen,
    setFiltersOpen,
    settings,
    setSettings,
    entity,
    setEntity,
    sectionDialog,
    setSectionDialog,
    sectioned,
    hasLayout,
    projectId,
    layout,
    showSections,
    quickTitle,
    setQuickTitle,
    newDraft,
    date,
    mode,
    range,
    allTasks,
    visible,
    hierarchyTasks: [...included.values()],
    groups,
    selectedEntity,
    title,
    collection,
    selectedTaskId,
    fallbackNewTask,
    editorHandle,
    editorOrigin,
    editorGuardRef,
    selectedTask,
    setParams,
    open,
    create,
    closeEditor,
    quickAdd,
    reorder,
    dragEnd,
    dragStart,
    dragMove,
    dragSnapshot,
    dragSource,
    displayedTasks,
    displayedGroups,
    displayedSections,
    sidebarProps,
    completedToday,
    todayTotal,
    activeFilters,
    description: descriptions[view],
  };
}

const ControllerContext = createContext<ReturnType<
  typeof useControllerState
> | null>(null);

export function WorkspaceController({ children }: { children: ReactNode }) {
  const controller = useControllerState();
  return (
    <ControllerContext.Provider value={controller}>
      {children}
      {controller.quickAction && (
        <TaskQuickActionPopover
          key={`${controller.quickAction.task.id}:${controller.quickAction.kind}`}
          action={controller.quickAction}
        />
      )}
    </ControllerContext.Provider>
  );
}

export function useWorkspaceController() {
  const controller = useContext(ControllerContext);
  if (!controller) throw new Error("WorkspaceController is required");
  return controller;
}
