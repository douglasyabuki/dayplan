import { referenceKey } from "@/lib/tasks/recurrence";
import { validateWorkspace } from "@/stores/workspace/validation";
import type { Task, TaskReference } from "@/types-and-constants/tasks";
import type { Workspace } from "@/types-and-constants/workspace";

/**
 * Adds independent guest copies while preserving account items and preferences.
 * @param account Existing validated account workspace.
 * @param guest Validated guest snapshot to import.
 * @param newId Unique ID factory, injectable for tests.
 * @returns {Workspace} A validated merged snapshot with all imported references remapped.
 * @example mergeGuestWorkspace(account, guest, () => crypto.randomUUID());
 */
export function mergeGuestWorkspace(
  account: Workspace,
  guest: Workspace,
  newId: () => string,
): Workspace {
  const maps = {
    tasks: new Map(guest.tasks.map((e) => [e.id, newId()])),
    projects: new Map(guest.projects.map((e) => [e.id, newId()])),
    sections: new Map(guest.sections.map((e) => [e.id, newId()])),
    tags: new Map(guest.tags.map((e) => [e.id, newId()])),
  };
  /**
   * Looks up an imported entity's replacement ID.
   * @param kind Entity collection containing the original ID.
   * @param value Original ID or an absent relationship.
   * @returns {string | null} Replacement ID, or null for an absent relationship.
   * @example id("tasks", guest.tasks[0].id);
   */
  const id = (kind: keyof typeof maps, value: string | null) =>
    value === null ? null : maps[kind].get(value)!;
  /**
   * Remaps task relationships, including partial occurrence overrides.
   * @param t Original task fields.
   * @returns {Partial<Task>} Copied fields with every present entity relationship remapped.
   * @example taskFields(guest.tasks[0]);
   */
  const taskFields = (t: Partial<Task>): Partial<Task> => ({
    ...t,
    ...(t.id !== undefined ? { id: id("tasks", t.id)! } : {}),
    ...(t.parentId !== undefined ? { parentId: id("tasks", t.parentId) } : {}),
    ...(t.projectId !== undefined
      ? { projectId: id("projects", t.projectId) }
      : {}),
    ...(t.sectionId !== undefined
      ? { sectionId: id("sections", t.sectionId) }
      : {}),
    ...(t.tagIds !== undefined
      ? { tagIds: t.tagIds.map((tag) => id("tags", tag)!) }
      : {}),
  });
  /**
   * Remaps a task or recurring occurrence reference.
   * @param ref Original reference and optional recurrence context.
   * @returns {TaskReference} Reference pointing to the imported task and recurrence root.
   * @example reference({ taskId: guest.tasks[0].id });
   */
  const reference = (ref: TaskReference): TaskReference => ({
    taskId: id("tasks", ref.taskId)!,
    ...(ref.context
      ? {
          context: {
            ...ref.context,
            recurrenceRootTaskId: id(
              "tasks",
              ref.context.recurrenceRootTaskId,
            )!,
          },
        }
      : {}),
  });
  /**
   * Finds the ordering offset for appending items to an account collection.
   * @param values Existing account items in the shared collection.
   * @returns {number} One beyond the greatest existing order, or zero for an empty collection.
   * @example offset(account.tags);
   */
  const offset = (values: { order: number }[]) =>
    Math.max(-1, ...values.map((e) => e.order)) + 1;
  const snapshot: Workspace = {
    ...account,
    projects: [
      ...account.projects,
      ...guest.projects.map((p) => ({ ...p, id: id("projects", p.id)! })),
    ],
    tags: [
      ...account.tags,
      ...guest.tags.map((t) => ({
        ...t,
        id: id("tags", t.id)!,
        parentId: id("tags", t.parentId),
        order:
          t.order +
          (t.parentId === null
            ? offset(account.tags.filter((e) => e.parentId === null))
            : 0),
      })),
    ],
    sections: [
      ...account.sections,
      ...guest.sections.map((s) => ({
        ...s,
        id: id("sections", s.id)!,
        projectId: id("projects", s.projectId),
        order:
          s.order +
          (s.projectId === null
            ? offset(account.sections.filter((e) => e.projectId === null))
            : 0),
      })),
    ],
    tasks: [
      ...account.tasks,
      ...guest.tasks.map(
        (t) =>
          ({
            ...taskFields(t),
            order:
              t.order +
              (t.projectId === null &&
              t.sectionId === null &&
              t.parentId === null
                ? offset(
                    account.tasks.filter(
                      (e) =>
                        e.projectId === null &&
                        e.sectionId === null &&
                        e.parentId === null,
                    ),
                  )
                : 0),
          }) as Task,
      ),
    ],
    layouts: { ...account.layouts },
    exceptions: { ...account.exceptions },
  };
  for (const [key, layout] of Object.entries(guest.layouts)) {
    // Collection layout keys are "project:<id>" or "tag:<id>".
    for (const [prefix, kind] of [
      ["project:", "projects"],
      ["tag:", "tags"],
    ] as const) {
      if (key.startsWith(prefix) && maps[kind].has(key.slice(prefix.length)))
        snapshot.layouts[prefix + maps[kind].get(key.slice(prefix.length))!] =
          layout;
    }
  }
  for (const e of Object.values(guest.exceptions)) {
    const copied = {
      ...e,
      ...reference(e),
      overrides: taskFields(e.overrides),
      parentRef: e.parentRef ? reference(e.parentRef) : e.parentRef,
    };
    snapshot.exceptions[referenceKey(copied)] = copied;
  }
  return validateWorkspace(snapshot);
}
