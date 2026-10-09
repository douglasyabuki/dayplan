import type { Occurrence, Task } from "@/types-and-constants/tasks";
export function validateTaskDraft(draft: Task): string | undefined {
  if (!draft.title.trim()) return "Give this task a title.";
  for (const value of [draft.schedule, draft.deadline]) {
    if (!value) continue;
    const date = new Date(`${value.date}T12:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ||
      Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value.date
    )
      return "Choose a valid date.";
    if (value.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time))
      return "Choose a valid time.";
  }
  if (
    draft.schedule &&
    (!Number.isFinite(draft.schedule.duration) ||
      draft.schedule.duration < 15 ||
      draft.schedule.duration > 1440)
  )
    return "Duration must be between 15 and 1440 minutes.";
  const anchor = draft.schedule?.date ?? draft.deadline?.date;
  if (draft.recurrence && !anchor)
    return "Add a scheduled date or deadline before setting a repeat rule.";
  if (
    draft.recurrence?.frequency === "weekdays" &&
    !draft.recurrence.weekdays.length
  )
    return "Choose at least one weekday.";
  if (draft.recurrence?.until && anchor && draft.recurrence.until < anchor)
    return "The repeat end date must be on or after the first occurrence.";
}

export function taskFields(task: Occurrence): Task {
  const { taskId, context, ...fields } = task;
  void context;
  return {
    ...fields,
    id: taskId,
    projectId: fields.parentId ? null : fields.projectId,
    sectionId: fields.parentId ? null : fields.sectionId,
  };
}

export type TaskScope = "occurrence" | "series";

export type EditableTaskFields = Pick<
  Task,
  | "title"
  | "description"
  | "priority"
  | "tagIds"
  | "deadline"
  | "schedule"
  | "recurrence"
>;

export type TaskOperation =
  | {
      kind: "edit";
      task: Occurrence;
      changes: Partial<EditableTaskFields>;
      scope: TaskScope;
    }
  | { kind: "complete"; task: Occurrence; completed: boolean; today: string }
  | { kind: "archive"; task: Occurrence; archived: boolean }
  | { kind: "delete"; task: Occurrence; scope: TaskScope }
  | {
      kind: "duplicate";
      task: Occurrence;
      tasks: Occurrence[];
      manual: boolean;
    }
  | {
      kind: "move";
      task: Occurrence;
      parentId: string | null;
      projectId: string | null;
      sectionId: string | null;
      beforeId?: string;
    };
