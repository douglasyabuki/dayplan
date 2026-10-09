import type { Task } from "@/types-and-constants/tasks";
/**
 * Creates a new empty task with generated identity and creation time.
 * @param title Initial task title; defaults to an empty string.
 * @param projectId Project to assign, or `null` for the inbox.
 * @returns A task with default fields, no parent, and no date or recurrence.
 * @example `newTask("Buy milk", null)` returns a new inbox task titled `Buy milk`.
 */
export function newTask(title = "", projectId: string | null = null): Task {
  return {
    id: crypto.randomUUID(),
    title,
    description: "",
    projectId,
    sectionId: null,
    tagIds: [],
    priority: "none",
    parentId: null,
    completed: false,
    archived: false,
    order: Date.now(),
    createdAt: new Date().toISOString(),
  };
}
