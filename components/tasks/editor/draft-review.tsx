"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { reference, resolveOccurrence } from "@/lib/tasks/recurrence";
import { draftCanApply, draftKey } from "@/stores/workspace/draft-guard";
import type { Task } from "@/types-and-constants/tasks";
import type { Workspace } from "@/types-and-constants/workspace";

import type { EditorSession } from "./use-task-editor";

function summary(task: Task | null | undefined, state: Workspace) {
  if (!task) return "Deleted or no longer available";
  return [
    task.title,
    task.description,
    `Priority: ${task.priority}`,
    task.completed ? "Completed" : "Open",
    task.archived ? "Archived" : "Active",
    `Scheduled: ${task.schedule?.date ?? "None"}${task.schedule?.time ? ` ${task.schedule.time}` : ""}`,
    `Due: ${task.deadline?.date ?? "None"}`,
    `Repeats: ${task.recurrence?.frequency ?? "Never"}`,
    task.recurrence?.until ? `Repeats until: ${task.recurrence.until}` : "",
    task.recurrence?.weekdays.length
      ? `Repeat days: ${task.recurrence.weekdays.map((day) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day]).join(", ")}`
      : "",
    task.schedule ? `Duration: ${task.schedule.duration} minutes` : "",
    task.deadline?.time ? `Due time: ${task.deadline.time}` : "",
    `Parent: ${task.parentId ? (state.tasks.find((t) => t.id === task.parentId)?.title ?? "Unavailable") : "None"}`,
    `Project: ${task.projectId ? (state.projects.find((p) => p.id === task.projectId)?.name ?? "Unavailable") : "Inbox"}`,
    `Section: ${task.sectionId ? (state.sections.find((s) => s.id === task.sectionId)?.name ?? "Unavailable") : "None"}`,
    `Tags: ${task.tagIds.map((id) => state.tags.find((t) => t.id === id)?.name ?? "Unavailable").join(", ") || "None"}`,
    `Position: ${task.order}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function DraftReview({ session }: { session: EditorSession }) {
  return session.conflicts.map((entry) => {
    const baseline =
      session.baselines[entry.original.id] ?? session.initialState;
    const previous = entry.isNew
      ? entry.original
      : resolveOccurrence(baseline, reference(entry.original));
    const remote = entry.isNew
      ? undefined
      : resolveOccurrence(session.state, reference(entry.original));
    const proposed = { ...(previous ?? entry.original), ...entry.changes };
    const related = (key: string, state: Workspace) =>
      (JSON.parse(key).tasks as Task[])
        .map((task) => summary(task, state))
        .join("\n\n") || "None";
    return (
      <Alert key={entry.original.id} variant="destructive">
        <AlertTitle>
          Review changes to {entry.original.title || "New task"}
        </AlertTitle>
        <AlertDescription>
          This task or a related parent, subtask, or repeating task changed.
          Review before saving your draft.
        </AlertDescription>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th>Previous</th>
                <th>Remote</th>
                <th>Your draft</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                {[
                  summary(previous, baseline),
                  summary(remote, session.state),
                  summary(proposed, session.state),
                ].map((value, i) => (
                  <td key={i} className="p-2 align-top whitespace-pre-wrap">
                    {value}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <details>
          <summary>Review related tasks</summary>
          <p className="whitespace-pre-wrap">
            Previous:{"\n"}
            {related(draftKey(baseline, entry), baseline)}
          </p>
          <p className="whitespace-pre-wrap">
            Remote:{"\n"}
            {related(draftKey(session.state, entry), session.state)}
          </p>
        </details>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={session.busy}
            onClick={() => session.review(entry, false)}
          >
            {remote ? "Use remote" : "Discard affected draft"}
          </Button>
          <Button
            type="button"
            disabled={
              session.busy ||
              !draftCanApply(
                session.state,
                entry,
                new Set(
                  Object.values(session.entries)
                    .filter((e) => e.isNew)
                    .map((e) => e.original.taskId),
                ),
              )
            }
            onClick={() => session.review(entry, true)}
          >
            Keep draft changes
          </Button>
        </div>
        {!remote && (
          <p>
            Copy any draft text you want to keep before discarding. Create a new
            task explicitly to restore it.
          </p>
        )}
      </Alert>
    );
  });
}
