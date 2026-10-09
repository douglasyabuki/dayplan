import type { Task } from "@/types-and-constants/tasks";

/**
 * Creates a new empty task with generated identity and creation time.
 * @param title Initial task title; defaults to an empty string.
 * @param projectId Project to assign, or `null` for the inbox.
 * @returns {Task} A task with a generated UUID `id`, the supplied `title` and `projectId`, empty description and tags, `sectionId` and `parentId` set to `null`, priority `"none"`, `completed` and `archived` set to `false`, `order` set to the current timestamp, and `createdAt` set to the current ISO timestamp. Schedule, deadline, and recurrence fields are absent.
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
