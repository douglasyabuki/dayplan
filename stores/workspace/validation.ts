import { tagIndex } from "@/lib/tags/hierarchy";
import { validateHierarchy } from "@/lib/tasks/hierarchy";
import { referenceKey, resolveOccurrence } from "@/lib/tasks/recurrence";
import { type Task } from "@/types-and-constants/tasks";
import { type Workspace } from "@/types-and-constants/workspace";
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validDate(value: unknown, schedule = false): boolean {
  if (value === undefined) return true;
  if (
    !isRecord(value) ||
    typeof value.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.date)
  )
    return false;
  const date = new Date(`${value.date}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value.date &&
    (value.time === undefined ||
      (typeof value.time === "string" &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(value.time))) &&
    (!schedule ||
      (typeof value.duration === "number" &&
        Number.isFinite(value.duration) &&
        value.duration >= 15 &&
        value.duration <= 1440))
  );
}

function validTask(value: unknown): value is Task {
  if (!isRecord(value)) return false;
  const task = value as Task;
  const rule = task.recurrence;
  return (
    typeof task.id === "string" &&
    (task.parentId === null || typeof task.parentId === "string") &&
    typeof task.title === "string" &&
    typeof task.description === "string" &&
    (task.projectId === null || typeof task.projectId === "string") &&
    (task.sectionId === null || typeof task.sectionId === "string") &&
    ["none", "low", "medium", "high"].includes(task.priority) &&
    Array.isArray(task.tagIds) &&
    task.tagIds.every((id) => typeof id === "string") &&
    typeof task.completed === "boolean" &&
    typeof task.archived === "boolean" &&
    Number.isFinite(task.order) &&
    typeof task.createdAt === "string" &&
    validDate(task.deadline) &&
    validDate(task.schedule, true) &&
    (!rule ||
      (isRecord(rule) &&
        ["daily", "weekdays", "weekly", "monthly"].includes(rule.frequency) &&
        Array.isArray(rule.weekdays) &&
        rule.weekdays.every(
          (day) => Number.isInteger(day) && day >= 0 && day <= 6,
        ) &&
        (rule.frequency !== "weekdays" || rule.weekdays.length > 0) &&
        !!(task.schedule || task.deadline) &&
        (!rule.until || validDate({ date: rule.until }))))
  );
}
export function validateWorkspace(value: unknown): Workspace {
  const state = value as Workspace;
  const entity = (e: unknown) =>
    isRecord(e) &&
    typeof e.id === "string" &&
    typeof e.name === "string" &&
    typeof e.color === "string";
  if (
    !isRecord(state) ||
    state.version !== 2 ||
    !Array.isArray(state.tasks) ||
    !state.tasks.every(validTask) ||
    !Array.isArray(state.sections) ||
    !Array.isArray(state.projects) ||
    !state.projects.every(entity) ||
    !Array.isArray(state.tags) ||
    !state.tags.every(entity) ||
    !isRecord(state.exceptions) ||
    !isRecord(state.layouts) ||
    !Object.values(state.layouts).every((l) => l === "list" || l === "board") ||
    typeof state.timezone !== "string" ||
    !["system", "light", "dark"].includes(state.theme)
  )
    throw new Error(
      "The saved workspace could not be read. Your stored data has not been changed.",
    );
  state.tags = state.tags.map((tag, order) => ({
    ...tag,
    parentId: tag.parentId === undefined ? null : tag.parentId,
    order: tag.order === undefined ? order : tag.order,
  }));
  tagIndex(state.tags);
  validateHierarchy(state.tasks);
  new Intl.DateTimeFormat("en-US", { timeZone: state.timezone });
  for (const section of state.sections)
    if (
      !isRecord(section) ||
      typeof section.id !== "string" ||
      typeof section.name !== "string" ||
      !Number.isFinite(section.order) ||
      (section.projectId !== null &&
        !state.projects.some((p) => p.id === section.projectId))
    )
      throw new Error("Invalid section.");
  for (const task of state.tasks)
    if (
      (task.projectId !== null &&
        !state.projects.some((p) => p.id === task.projectId)) ||
      (task.sectionId !== null &&
        !state.sections.some(
          (s) => s.id === task.sectionId && s.projectId === task.projectId,
        ))
    )
      throw new Error("Invalid task location.");
  for (const [key, e] of Object.entries(state.exceptions)) {
    if (
      !isRecord(e) ||
      referenceKey(e) !== key ||
      !isRecord(e.overrides) ||
      (e.deleted !== undefined && typeof e.deleted !== "boolean") ||
      !state.tasks.some((t) => t.id === e.taskId) ||
      (e.context &&
        (!isRecord(e.context) ||
          !validDate({ date: e.context.occurrenceDate }) ||
          !state.tasks.some(
            (t) => t.id === e.context!.recurrenceRootTaskId && t.recurrence,
          )))
    )
      throw new Error("Invalid occurrence exception.");
    if (
      e.cleared &&
      (!Array.isArray(e.cleared) ||
        !e.cleared.every((k) =>
          ["schedule", "deadline", "recurrence"].includes(k),
        ))
    )
      throw new Error("Invalid cleared occurrence fields.");
    const combined = {
      ...state.tasks.find((t) => t.id === e.taskId)!,
      ...e.overrides,
    };
    for (const key of e.cleared ?? [])
      delete (combined as unknown as Record<string, unknown>)[key];
    if (!validTask(combined)) throw new Error("Invalid occurrence fields.");
    if (
      !e.deleted &&
      e.parentRef &&
      (!isRecord(e.parentRef) ||
        !state.tasks.some((t) => t.id === e.parentRef!.taskId) ||
        !resolveOccurrence(state, e.parentRef))
    )
      throw new Error("Invalid occurrence parent.");
  }
  return state;
}
