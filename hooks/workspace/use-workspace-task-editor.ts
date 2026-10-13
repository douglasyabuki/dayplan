"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { startTransition, useEffect, useRef, useState } from "react";

import type { TaskOpenOptions } from "@/components/tasks/task-item";
import type { useWorkspaceNavigation } from "@/hooks/workspace/use-workspace-navigation";
import { newTask } from "@/lib/tasks/factory";
import {
  asOccurrence,
  parseReference,
  resolveOccurrence,
} from "@/lib/tasks/recurrence";
import {
  creationDefaults,
  isAggregateView,
  type TaskCreationContext,
} from "@/lib/workspace/grouping";
import { workspaceHref } from "@/lib/workspace/routes";
import { selectTasks } from "@/lib/workspace/selectors";
import { contentKey } from "@/stores/workspace/draft-guard";
import type { useWorkspace } from "@/stores/workspace/provider";
import type { Occurrence } from "@/types-and-constants/tasks";
import type { Workspace } from "@/types-and-constants/workspace";

type TaskEditorOptions = Pick<
  ReturnType<typeof useWorkspace>,
  "state" | "today" | "act"
> &
  Pick<
    ReturnType<typeof useWorkspaceNavigation>,
    "view" | "selectedId" | "params" | "setParams" | "router"
  > & {
    allTasks: Occurrence[];
    closeTaskActions: () => void;
  };

/**
 * Manages task selection, creation, quick add, and keyboard shortcuts for a workspace.
 * @param {TaskEditorOptions} options Workspace state and actions, route navigation data, expanded tasks, and a callback to close task actions.
 * @returns {object} Editor state and controls: `quickTitle` and its setter, the popover handle and origin, the editor guard ref, draft and selected task data, a fallback new task, and `open`, `create`, `closeEditor`, and `quickAdd` actions.
 * @example
 * const editor = useWorkspaceTaskEditor({ ...workspace, ...navigation, allTasks, closeTaskActions });
 * editor.create();
 */
export function useWorkspaceTaskEditor({
  state,
  today,
  act,
  view,
  selectedId,
  params,
  setParams,
  router,
  allTasks,
  closeTaskActions,
}: TaskEditorOptions) {
  const [creationFeedback, setCreationFeedback] = useState<{
    task: Occurrence;
    message: string;
  } | null>(null);
  const creationOrigin = useRef<{
    view: string;
    params: URLSearchParams;
  } | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [editorHandle] = useState(() => PopoverPrimitive.createHandle());
  const [editorOrigin, setEditorOrigin] = useState<
    (TaskOpenOptions & { taskId: string }) | null
  >(null);
  const editorGuardRef = useRef<((action: () => void) => void) | null>(null);
  const [newDraft, setNewDraft] = useState<Occurrence | null>(null);
  const [retainedTask, setRetainedTask] = useState<Occurrence | null>(null);
  const selectedTaskId = params.get("task");
  const fallbackNewTask = asOccurrence(newTask());
  let selectedTask = allTasks.find((t) => t.id === selectedTaskId);
  if (!selectedTask && selectedTaskId) {
    const ref = parseReference(selectedTaskId);
    if (ref) selectedTask = resolveOccurrence(state, ref);
  }

  if (selectedTask && contentKey(selectedTask) !== contentKey(retainedTask))
    setRetainedTask(selectedTask);
  else if (!selectedTask && retainedTask?.id === selectedTaskId)
    selectedTask = retainedTask;
  else if (!selectedTask && retainedTask) setRetainedTask(null);

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
    day?: string | TaskCreationContext,
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
        if (isAggregateView(view)) {
          Object.assign(
            task,
            creationDefaults(
              view,
              params,
              today,
              typeof day === "object" ? day : {},
            ),
          );
          creationOrigin.current = {
            view,
            params: new URLSearchParams(params),
          };
        } else creationOrigin.current = null;
        if (view === "tags" && selectedId) task.tagIds = [selectedId];
        if (typeof day === "string")
          task.schedule = { date: day, time, duration: 30 };
        setNewDraft(asOccurrence(task));
        setParams({ task: "new" });
      });
    if (editorGuardRef.current) editorGuardRef.current(action);
    else action();
  }
  function onTaskCreated(task: Occurrence, nextState: Workspace) {
    const origin = creationOrigin.current;
    if (
      !origin ||
      selectTasks(
        [task],
        nextState,
        origin.view,
        undefined,
        origin.params,
        today,
      ).length
    ) {
      setCreationFeedback(null);
      return;
    }
    const location =
      nextState.projects.find((p) => p.id === task.projectId)?.name ?? "Inbox";
    const withoutFilters = selectTasks(
      [task],
      nextState,
      origin.view,
      undefined,
      new URLSearchParams({
        status: "all",
        ...(origin.params.get("range")
          ? { range: origin.params.get("range")! }
          : {}),
      }),
      today,
    );
    const reason = withoutFilters.length
      ? "it does not match the current filters"
      : "its dates fall outside this view";
    setCreationFeedback({
      task,
      message: `Task saved in ${location}; ${reason}.`,
    });
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
  return {
    creationFeedback,
    dismissCreationFeedback: () => setCreationFeedback(null),
    onTaskCreated,
    quickTitle,
    setQuickTitle,
    editorHandle,
    editorOrigin,
    editorGuardRef,
    newDraft,
    selectedTaskId,
    selectedTask,
    fallbackNewTask,
    open,
    create,
    closeEditor,
    quickAdd,
  };
}
