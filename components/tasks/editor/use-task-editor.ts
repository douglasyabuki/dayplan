"use client";
import { useEffect, useState } from "react";

import { useWorkspaceController } from "@/contexts/workspace-controller";
import { addDays } from "@/lib/dates";
import { type DraftEntries, sessionTasks } from "@/lib/tasks/editor";
import { newTask } from "@/lib/tasks/factory";
import type { TaskOperation } from "@/lib/tasks/operations";
import { validateTaskDraft } from "@/lib/tasks/operations";
import {
  asOccurrence,
  occurrenceParent,
  reference,
  referenceKey,
  resolveOccurrence,
} from "@/lib/tasks/recurrence";
import {
  draftCanApply,
  type DraftExpectation,
  draftKey,
} from "@/stores/workspace/draft-guard";
import { useWorkspace } from "@/stores/workspace/provider";
import type { Occurrence } from "@/types-and-constants/tasks";
import type { Workspace } from "@/types-and-constants/workspace";

export function useEditorSession(
  task: Occurrence,
  isNew: boolean,
  close: () => void,
) {
  const workspace = useWorkspace();
  const [initialState] = useState(() => structuredClone(workspace.state));
  const [baselines, setBaselines] = useState<Record<string, Workspace>>({});
  const [reviewRevision, setReviewRevision] = useState(0);
  const [entries, setEntries] = useState<DraftEntries>(() =>
    isNew
      ? {
          [task.id]: {
            original: task,
            changes: {},
            isNew: true,
            scope: "occurrence",
          },
        }
      : {
          [task.id]: {
            original: task,
            changes: {},
            isNew: false,
            scope: "occurrence",
          },
        },
  );
  const [pendingTitles, setPendingTitles] = useState<Record<string, string>>(
    {},
  );
  const { editorGuardRef, onTaskCreated } = useWorkspaceController();
  const dirty =
    Object.values(pendingTitles).some((title) => !!title.trim()) ||
    Object.values(entries).some(
      (e) => e.isNew || Object.keys(e.changes).length > 0,
    );
  const guard = (action: () => void) =>
    dirty
      ? workspace.confirm({
          title: "Discard unsaved changes?",
          description:
            "Field edits have not been saved. Completed, archived, or deleted tasks are already updated; use Undo to reverse those actions.",
          action,
        })
      : action();
  useEffect(() => {
    editorGuardRef.current = guard;
    return () => {
      editorGuardRef.current = null;
    };
  });
  function update(task: Occurrence, changes: Partial<Occurrence>) {
    setEntries((current) => ({
      ...current,
      [task.id]: {
        ...(current[task.id] ?? {
          original: resolveOccurrence(initialState, reference(task)) ?? task,
          isNew: false,
          scope: "occurrence" as const,
        }),
        changes: { ...current[task.id]?.changes, ...changes },
      },
    }));
  }
  function add(parent: Occurrence, title: string) {
    const task = asOccurrence({
      ...newTask(title),
      parentId: parent.taskId,
      order: Date.now(),
    });
    setEntries((current) => ({
      ...current,
      [task.id]: {
        original: task,
        changes: {},
        isNew: true,
        scope: "occurrence",
        parentRef: reference(parent),
      },
    }));
    return task;
  }
  const expectation = (entry: DraftEntries[string]): DraftExpectation => ({
    entry,
    key: draftKey(baselines[entry.original.id] ?? initialState, entry),
  });
  const newIds = new Set(
    Object.values(entries)
      .filter((e) => e.isNew)
      .map((e) => e.original.taskId),
  );
  const conflicts = Object.values(entries).filter(
    (entry) =>
      draftKey(workspace.state, entry) !== expectation(entry).key ||
      !draftCanApply(workspace.state, entry, newIds),
  );
  function review(entry: DraftEntries[string], keep: boolean) {
    const current = workspace.readEditorState();
    // A captured review button must not approve remote data it never displayed.
    if (draftKey(current, entry) !== draftKey(workspace.state, entry)) return;
    if (keep && !draftCanApply(current, entry, newIds)) return;
    const live = entry.isNew
      ? entry.original
      : resolveOccurrence(current, reference(entry.original));
    setEntries((previous) => {
      const next = { ...previous };
      if (!live || (!keep && entry.isNew)) delete next[entry.original.id];
      else
        next[entry.original.id] = {
          ...entry,
          original: live,
          changes: keep ? entry.changes : {},
        };
      return next;
    });
    setBaselines((previous) => ({ ...previous, [entry.original.id]: current }));
    setReviewRevision((value) => value + 1);
    if (!keep)
      setPendingTitles((previous) => ({
        ...previous,
        [entry.original.id]: "",
      }));
  }
  function operate(operation: TaskOperation, message = "Task updated") {
    if (conflicts.length) return false;
    const entry = entries[operation.task.id] ?? {
      original: operation.task,
      changes: {},
      isNew: false,
      scope: "occurrence" as const,
    };
    if (
      !workspace.operateEditor(
        operation,
        [...Object.values(entries).map(expectation), expectation(entry)],
        message,
      )
    )
      return false;
    const next = workspace.readEditorState();
    setBaselines((previous) => ({
      ...previous,
      ...Object.fromEntries(
        Object.values(entries).map((e) => [e.original.id, next]),
      ),
    }));
    return true;
  }
  function complete(target: Occurrence, completed: boolean) {
    const unsaved = !!entries[target.id]?.isNew;
    if (
      !unsaved &&
      !operate(
        {
          kind: "complete",
          task: target,
          completed,
          today: workspace.today,
        },
        completed ? "Task completed" : "Task reopened",
      )
    )
      return;
    const ids = new Set([target.taskId]);
    if (completed) {
      let more = true;
      while (more) {
        more = false;
        for (const entry of Object.values(entries)) {
          const parent =
            entry.changes.parentId ??
            entry.original.parentId ??
            entry.parentRef?.taskId;
          if (parent && ids.has(parent) && !ids.has(entry.original.taskId)) {
            ids.add(entry.original.taskId);
            more = true;
          }
        }
      }
    }
    setEntries((current) => {
      const next = { ...current };
      for (const [id, entry] of Object.entries(current))
        if (entry.isNew && ids.has(entry.original.taskId))
          next[id] = { ...entry, changes: { ...entry.changes, completed } };
      if (unsaved && !completed) {
        let parentId = target.parentId;
        const seen = new Set<string>();
        while (parentId && !seen.has(parentId)) {
          seen.add(parentId);
          const entry = Object.values(next).find(
            (e) => e.original.taskId === parentId,
          );
          if (!entry) break;
          next[entry.original.id] = {
            ...entry,
            changes: { ...entry.changes, completed: false },
          };
          parentId = entry.original.parentId;
        }
      }
      return next;
    });
  }
  return {
    ...workspace,
    operate,
    conflicts,
    review,
    expectation,
    initialState,
    baselines,
    reviewRevision,
    onTaskCreated,
    entries,
    setEntries,
    pendingTitles,
    setPendingTitles,
    dirty,
    guard,
    update,
    add,
    complete,
    close,
    tasks: sessionTasks(
      workspace.state,
      entries,
      [
        task.context?.occurrenceDate ?? workspace.today,
        ...workspace.state.tasks
          .filter((t) => t.recurrence)
          .map((t) => t.schedule?.date ?? t.deadline?.date ?? workspace.today),
      ].sort()[0],
      addDays(task.context?.occurrenceDate ?? workspace.today, 365),
    ),
  };
}
export type EditorSession = ReturnType<typeof useEditorSession>;
export function useTaskEditor(
  task: Occurrence,
  isNew: boolean,
  close: () => void,
  session: EditorSession,
  nested = false,
) {
  const { initialState, setEntries } = session;
  useEffect(() => {
    if (!nested || isNew) return;
    setEntries((current) =>
      current[task.id]
        ? current
        : {
            ...current,
            [task.id]: {
              original:
                resolveOccurrence(initialState, reference(task)) ?? task,
              changes: {},
              isNew: false,
              scope: "occurrence",
            },
          },
    );
  }, [nested, isNew, task, initialState, setEntries]);
  const [snapshot] = useState(() => structuredClone(session.entries));
  const [snapshotEpoch] = useState(session.adoptionEpoch);
  const [snapshotReview] = useState(session.reviewRevision);
  const newTitle = session.pendingTitles[task.id] ?? "";
  const setNewTitle = (title: string) =>
    session.setPendingTitles((current) => ({ ...current, [task.id]: title }));
  const [error, setError] = useState("");
  const entry = session.entries[task.id];
  const live = isNew ? task : resolveOccurrence(session.state, reference(task));
  const draft = { ...(live ?? task), ...entry?.changes };
  if (draft.parentId) {
    let parent =
      session.tasks.find(
        (t) =>
          t.taskId === draft.parentId &&
          JSON.stringify(t.context) === JSON.stringify(draft.context),
      ) ?? session.tasks.find((t) => t.taskId === draft.parentId);
    const seen = new Set<string>([draft.taskId]);
    while (parent && !seen.has(parent.taskId)) {
      seen.add(parent.taskId);
      draft.projectId = parent.projectId;
      draft.sectionId = parent.sectionId;
      parent = parent.parentId
        ? session.tasks.find(
            (t) =>
              t.taskId === parent!.parentId &&
              JSON.stringify(t.context) === JSON.stringify(parent!.context),
          )
        : undefined;
    }
  }
  const scope = entry?.scope ?? "occurrence";
  function patch(change: Partial<Occurrence>) {
    session.update(task, change);
    setError("");
  }
  function submit() {
    if (session.busy) return;
    if (session.conflicts.length) {
      setError("Review the remote changes before saving.");
      return;
    }
    let entries = session.entries;
    if (newTitle.trim()) {
      const child = asOccurrence({
        ...newTask(newTitle.trim()),
        parentId: draft.taskId,
        order: Date.now(),
      });
      entries = {
        ...entries,
        [child.id]: {
          original: child,
          changes: {},
          isNew: true,
          scope: "occurrence",
          parentRef: reference(draft),
        },
      };
      session.setEntries(entries);
      setNewTitle("");
    }
    const message = validateTaskDraft(draft);
    if (message) {
      setError(message);
      return;
    }
    if (nested) {
      close();
      return;
    }
    try {
      const saved = session.commitEditorDrafts(
        entries,
        Object.values(entries).map(session.expectation),
        isNew ? "Task added" : "Tasks updated",
      );
      const nextState = session.readEditorState();
      if (saved) {
        if (isNew) session.onTaskCreated(draft, nextState);
        close();
      }
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to save changes.",
      );
    }
  }
  function requestClose() {
    if (!nested) {
      if (newTitle.trim() && !session.dirty)
        session.confirm({
          title: "Discard unsaved changes?",
          description: "Your new subtask has not been saved.",
          action: close,
        });
      else session.guard(close);
      return;
    }
    if (
      snapshotEpoch === session.adoptionEpoch &&
      snapshotReview === session.reviewRevision
    ) {
      session.setEntries(snapshot);
      setNewTitle("");
    }
    close();
  }
  function complete(completed: boolean) {
    session.complete(draft, completed);
  }
  function remove() {
    session.confirm({
      title:
        task.context && scope === "series"
          ? "Delete this series and its subtasks?"
          : "Delete this task and its subtasks?",
      description:
        task.context && scope === "occurrence"
          ? "This removes this occurrence and its occurrence subtree. Other occurrences remain. You can Undo this action."
          : "This removes the selected template subtree, including descendant series and their occurrences. You can Undo this action.",
      action: () => {
        if (
          !isNew &&
          !session.operate({ kind: "delete", task, scope }, "Task deleted")
        )
          return;
        const ids = new Set([task.taskId]);
        let more = true;
        while (more) {
          more = false;
          for (const t of session.tasks)
            if (t.parentId && ids.has(t.parentId) && !ids.has(t.taskId)) {
              ids.add(t.taskId);
              more = true;
            }
        }
        session.setEntries((current) =>
          Object.fromEntries(
            Object.entries(current).filter(
              ([, e]) => !ids.has(e.original.taskId),
            ),
          ),
        );
        close();
      },
    });
  }
  function archive() {
    if (isNew) {
      patch({ archived: !draft.archived });
      close();
      return;
    }
    session.guard(() => {
      const ownArchived = !!session.state.tasks.find(
        (t) => t.id === task.taskId,
      )?.archived;
      if (
        !session.operate(
          { kind: "archive", task, archived: !ownArchived },
          ownArchived ? "Task restored" : "Task archived",
        )
      )
        return;
      session.setEntries({});
      close();
    });
  }
  const direct = session.tasks.filter((t) => {
    const stagedParent = session.entries[t.id]?.parentRef;
    const parent = stagedParent ?? occurrenceParent(session.state, t);
    return parent
      ? referenceKey(parent) === task.id
      : t.parentId === task.taskId && !t.context && !task.context;
  });
  // Independent series belong to the template, not to this parent occurrence.
  // Show one representative with its own context instead of duplicating each instance.
  const independent = session.state.tasks.filter(
    (t) =>
      t.parentId === task.taskId &&
      t.recurrence &&
      t.id !== task.context?.recurrenceRootTaskId,
  );
  for (const template of independent) {
    if (direct.some((t) => t.taskId === template.id)) continue;
    const anchor = template.schedule?.date ?? template.deadline?.date;
    if (!anchor) continue;
    const occurrences = session.tasks
      .filter((t) => t.taskId === template.id)
      .sort((a, b) =>
        (b.context?.occurrenceDate ?? "").localeCompare(
          a.context?.occurrenceDate ?? "",
        ),
      );
    const representative =
      occurrences.find(
        (t) => (t.context?.occurrenceDate ?? "") <= session.today,
      ) ?? occurrences.at(-1);
    if (representative) direct.push(representative);
  }
  const children = direct.sort((a, b) => a.order - b.order);

  return {
    ...session,
    draft,
    scope,
    setScope: (scope: "occurrence" | "series") =>
      session.setEntries((current) => ({
        ...current,
        [task.id]: {
          ...(current[task.id] ?? { original: task, changes: {}, isNew }),
          scope,
        },
      })),
    newTitle,
    setNewTitle,
    error,
    patch,
    submit,
    remove,
    archive,
    ownArchived: !!session.state.tasks.find((t) => t.id === task.taskId)
      ?.archived,
    complete,
    requestClose,
    children,
    addChild: () => {
      if (newTitle.trim()) {
        session.add(draft, newTitle.trim());
        setNewTitle("");
      }
    },
  };
}
