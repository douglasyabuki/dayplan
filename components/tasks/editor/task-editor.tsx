"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import {
  Archive,
  ArrowLeft,
  ChevronRight,
  GripVertical,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  EditorSelect,
  PriorityPicker,
  TaskDatePicker,
  TaskLocationPicker,
  TaskTagsPicker,
} from "@/components/tasks/editor/task-editor-controls";
import {
  type EditorSession,
  useEditorSession,
  useTaskEditor,
} from "@/components/tasks/editor/use-task-editor";
import { TaskCheckbox } from "@/components/tasks/task-item";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspaceController } from "@/contexts/workspace-controller";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { compactTiming } from "@/lib/tasks/presentation";
import type { Occurrence } from "@/types-and-constants/tasks";

function useLiveTrigger(id?: string) {
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!id) return () => {};
      const observer = new MutationObserver(notify);
      observer.observe(document.body, { childList: true, subtree: true });
      return () => observer.disconnect();
    },
    [id],
  );
  return useSyncExternalStore(
    subscribe,
    () => !!id && !!document.getElementById(id)?.isConnected,
    () => false,
  );
}

export function TaskEditor(props: {
  task: Occurrence;
  isNew: boolean;
  close: () => void;
}) {
  const session = useEditorSession(props.task, props.isNew, props.close);
  return <TaskEditorPanel {...props} session={session} />;
}
function TaskEditorPanel({
  task,
  isNew,
  close,
  session,
  nested = false,
  triggerId: nestedTrigger,
  popoverHandle,
}: {
  task: Occurrence;
  isNew: boolean;
  close: () => void;
  session: EditorSession;
  nested?: boolean;
  triggerId?: string;
  popoverHandle?: ReturnType<typeof PopoverPrimitive.createHandle>;
}) {
  const editor = useTaskEditor(task, isNew, close, session, nested);
  const fieldId = useId();
  const [child, setChild] = useState<{
    task: Occurrence;
    triggerId: string;
  } | null>(null);
  const [childHandle] = useState(() => PopoverPrimitive.createHandle());
  const [dragChild, setDragChild] = useState<string | null>(null);
  const { editorHandle, editorOrigin, layout } = useWorkspaceController();
  const origin = useMemo(
    () =>
      nested
        ? { taskId: task.id, triggerId: nestedTrigger }
        : editorOrigin?.taskId === task.id
          ? editorOrigin
          : null,
    [nested, task.id, nestedTrigger, editorOrigin],
  );
  const listLayout = layout === "list";
  const rowAnchor = useCallback(() => {
    const trigger = origin?.triggerId
      ? document.getElementById(origin.triggerId)
      : null;
    return trigger?.closest<HTMLElement>("[data-task-item]") ?? trigger;
  }, [origin]);
  const liveTrigger = useLiveTrigger(origin?.triggerId);
  const mobile = useIsMobile();
  const anchored = (!isNew || nested) && !mobile && liveTrigger;
  const [descriptionOpen, setDescriptionOpen] = useState(!!task.description);
  const titleRef = useRef<HTMLInputElement>(null);
  const subtaskRef = useRef<HTMLInputElement>(null);
  const { draft, patch } = editor;
  const initialFocus = () =>
    origin?.focusSubtask ? subtaskRef.current : titleRef.current;
  const title = isNew ? "Create task" : "Edit task";
  const body = (
    <>
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          editor.submit();
        }}
      >
        <div className="flex items-center gap-2 px-4 py-3">
          {nested && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={editor.submit}
              aria-label="Back to parent"
            >
              <ArrowLeft />
            </Button>
          )}
          <TaskCheckbox
            priority={draft.priority}
            checked={draft.completed}
            aria-label={draft.completed ? "Reopen task" : "Complete task"}
            onCheckedChange={(completed) => editor.complete(completed)}
          />
          <FieldGroup className="min-w-0 flex-1 flex-row items-center gap-0">
            <Field className="w-auto min-w-0">
              <TaskDatePicker
                mode="schedule"
                draft={draft}
                patch={patch}
                today={editor.today}
                recurrenceLocked={!!task.context && editor.scope !== "series"}
              />
            </Field>
            <span className="text-muted-foreground shrink-0" aria-hidden="true">
              ·
            </span>
            <Field className="w-auto min-w-0">
              <TaskDatePicker
                mode="deadline"
                draft={draft}
                patch={patch}
                today={editor.today}
              />
            </Field>
          </FieldGroup>
          <TaskLocationPicker
            draft={draft}
            patch={patch}
            state={editor.state}
          />
          <PriorityPicker draft={draft} patch={patch} />
          {anchored ? (
            <PopoverPrimitive.Close
              render={<Button type="button" variant="ghost" size="icon-sm" />}
              aria-label="Close task editor"
            >
              <X />
            </PopoverPrimitive.Close>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={editor.requestClose}
              aria-label="Close task editor"
            >
              <X />
            </Button>
          )}
        </div>
        <Separator />
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <FieldGroup>
            {task.context && (
              <EditorSelect
                label="Apply changes to"
                value={editor.scope}
                onChange={(value) =>
                  editor.setScope(value as typeof editor.scope)
                }
                options={[
                  { value: "occurrence", label: "This occurrence" },
                  { value: "series", label: "Entire series" },
                ]}
              />
            )}
            <Field data-invalid={!!editor.error && !draft.title.trim()}>
              <FieldLabel htmlFor={`${fieldId}-title`} className="sr-only">
                Task title
              </FieldLabel>
              <Input
                ref={titleRef}
                data-task-title-input
                id={`${fieldId}-title`}
                className="h-auto min-h-10 border-transparent bg-transparent text-lg font-semibold"
                placeholder="What would you like to do?"
                value={draft.title}
                onChange={(event) => patch({ title: event.target.value })}
                aria-invalid={!!editor.error && !draft.title.trim()}
                aria-describedby={editor.error ? `${fieldId}-error` : undefined}
              />
            </Field>
            {descriptionOpen ? (
              <Field>
                <FieldLabel
                  htmlFor={`${fieldId}-description`}
                  className="sr-only"
                >
                  Description
                </FieldLabel>
                <Textarea
                  data-task-description-input
                  id={`${fieldId}-description`}
                  className="border-transparent bg-transparent"
                  placeholder="Add a little context…"
                  value={draft.description}
                  onChange={(event) =>
                    patch({ description: event.target.value })
                  }
                  rows={3}
                />
              </Field>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-fit"
                onClick={() => {
                  setDescriptionOpen(true);
                  requestAnimationFrame(() =>
                    document.getElementById(`${fieldId}-description`)?.focus(),
                  );
                }}
              >
                <Plus data-icon="inline-start" />
                Add description
              </Button>
            )}
          </FieldGroup>
          <div
            className="flex flex-wrap items-center gap-1"
            aria-label="Task properties"
          >
            <TaskTagsPicker draft={draft} patch={patch} state={editor.state} />
          </div>
          <Separator />
          <section className="flex flex-col gap-2" aria-label="Subtasks">
            <p className="text-muted-foreground text-xs">
              Subtasks: {editor.children.filter((t) => t.completed).length}/
              {editor.children.length}
            </p>
            {editor.children.map((item, index) => {
              const timing = compactTiming(
                item.schedule,
                item.deadline,
                editor.today,
              );
              const triggerId = `${fieldId}-child-${index}`;
              const reorder = (sourceId: string) => {
                const ids = editor.children
                  .map((t) => t.id)
                  .filter((id) => id !== sourceId);
                ids.splice(ids.indexOf(item.id), 0, sourceId);
                ids.forEach((id, order) => {
                  const t = editor.children.find((t) => t.id === id);
                  if (t) session.update(t, { order });
                });
              };
              return (
                <div
                  key={item.id}
                  data-task-item
                  className="flex items-center gap-2 rounded-md border p-2"
                  onDragOver={(event) => {
                    if (dragChild) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragChild && dragChild !== item.id) reorder(dragChild);
                    setDragChild(null);
                  }}
                >
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    draggable
                    aria-label={`Reorder ${item.title}`}
                    onDragStart={(event) => {
                      event.stopPropagation();
                      setDragChild(item.id);
                    }}
                    onDragEnd={() => setDragChild(null)}
                    onKeyDown={(event) => {
                      const direction =
                        event.key === "ArrowUp"
                          ? -1
                          : event.key === "ArrowDown"
                            ? 1
                            : 0;
                      const destination = index + direction;
                      if (
                        !direction ||
                        destination < 0 ||
                        destination >= editor.children.length
                      )
                        return;
                      event.preventDefault();
                      const reordered = [...editor.children];
                      reordered.splice(index, 1);
                      reordered.splice(destination, 0, item);
                      reordered.forEach((task, order) =>
                        session.update(task, { order }),
                      );
                    }}
                  >
                    <GripVertical />
                  </Button>
                  <TaskCheckbox
                    priority={item.priority}
                    checked={item.completed}
                    aria-label={`Complete ${item.title}`}
                    onCheckedChange={(completed) =>
                      session.complete(item, completed)
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{item.title}</p>
                    {item.recurrence &&
                      item.context?.recurrenceRootTaskId !==
                        task.context?.recurrenceRootTaskId && (
                        <p className="text-muted-foreground text-xs">
                          Repeats independently
                        </p>
                      )}
                    <p className="text-muted-foreground text-xs">
                      {[timing.scheduled, timing.due]
                        .filter(Boolean)
                        .join(" | ")}
                    </p>
                  </div>
                  <PopoverTrigger
                    id={triggerId}
                    handle={childHandle}
                    render={
                      <Button type="button" variant="ghost" size="icon-sm" />
                    }
                    aria-label={`Edit ${item.title}`}
                    onClick={() => setChild({ task: item, triggerId })}
                  >
                    <ChevronRight />
                  </PopoverTrigger>
                </div>
              );
            })}
            <div className="flex items-center gap-2">
              <Input
                ref={subtaskRef}
                aria-label="New subtask"
                placeholder="Add a subtask..."
                value={editor.newTitle}
                onChange={(event) => editor.setNewTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    editor.addChild();
                  }
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={editor.addChild}
                aria-label="Add subtask"
              >
                <Plus />
              </Button>
            </div>
          </section>
          {editor.error && (
            <p
              id={`${fieldId}-error`}
              role="alert"
              className="text-destructive text-sm"
            >
              {editor.error}
            </p>
          )}
        </div>
        <Separator />
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div>
            {(!isNew || nested) && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button type="button" variant="ghost" size="icon-sm" />
                  }
                  aria-label="Task actions"
                >
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="quick-actions-dropdown"
                >
                  <DropdownMenuGroup>
                    <DropdownMenuItem
                      disabled={task.archived && !editor.ownArchived}
                      onClick={editor.archive}
                    >
                      {editor.ownArchived ? <RotateCcw /> : <Archive />}
                      {task.archived && !editor.ownArchived
                        ? "Archived by parent"
                        : editor.ownArchived
                          ? "Restore task"
                          : task.context
                            ? "Archive entire series"
                            : "Archive task"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={editor.remove}
                    >
                      <Trash2 />
                      {task.context && editor.scope === "series"
                        ? "Delete entire series"
                        : "Delete task"}
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          <div className="flex gap-2">
            {session.notice && (
              <Button type="button" variant="ghost" onClick={session.undo}>
                Undo
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={editor.requestClose}
            >
              Cancel
            </Button>
            <Button type="submit">
              {nested ? "Done" : isNew ? "Create task" : "Save changes"}
            </Button>
          </div>
        </div>
      </form>
      {child &&
        (session.entries[child.task.id]?.isNew ||
          session.state.tasks.some((t) => t.id === child.task.taskId)) && (
          <TaskEditorPanel
            key={child.task.id}
            task={child.task}
            isNew={!!session.entries[child.task.id]?.isNew}
            close={() => setChild(null)}
            session={session}
            nested
            triggerId={child.triggerId}
            popoverHandle={childHandle}
          />
        )}
    </>
  );
  return (
    <>
      <Popover
        handle={nested ? popoverHandle : editorHandle}
        triggerId={origin?.triggerId ?? null}
        open={anchored}
        modal
        onOpenChange={(open, details) => {
          if (!open) {
            details.cancel();
            editor.requestClose();
          }
        }}
      >
        {anchored && (
          <PopoverContent
            anchor={listLayout ? rowAnchor : undefined}
            side={listLayout ? "bottom" : "right"}
            align="start"
            alignOffset={listLayout ? 0 : -8}
            sideOffset={listLayout ? 8 : 28}
            className="flex max-h-[min(42rem,calc(100dvh-2rem))] w-120 max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0"
            initialFocus={initialFocus}
          >
            <PopoverTitle className="sr-only">{title}</PopoverTitle>
            <PopoverDescription className="sr-only">
              Edit task details. Done retains child edits; Save commits the
              editing session.
            </PopoverDescription>
            {body}
          </PopoverContent>
        )}
      </Popover>
      {!anchored && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) editor.requestClose();
          }}
        >
          <DialogContent
            showCloseButton={false}
            className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-120"
            initialFocus={initialFocus}
          >
            <DialogTitle className="sr-only">{title}</DialogTitle>
            <DialogDescription className="sr-only">
              A title is all you need. Add details when useful.
            </DialogDescription>
            {body}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
