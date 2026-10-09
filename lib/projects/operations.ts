import type { Project } from "@/types-and-constants/projects";

/**
 * Adds a project or replaces the project with the same ID.
 * @param projects Existing projects.
 * @param project Project to insert or save.
 * @returns {Project[]} A new array with `project` replacing the item with the same ID, or appended when no item has that ID.
 * @example `saveProject(projects, { id: "work", name: "Work", color: "blue" })` saves the project with ID `work`.
 */
export function saveProject(projects: Project[], project: Project): Project[] {
  return projects.some((p) => p.id === project.id)
    ? projects.map((p) => (p.id === project.id ? project : p))
    : [...projects, project];
}

/**
 * Removes a project by ID.
 * @param projects Existing projects.
 * @param id ID of the project to remove.
 * @returns {Project[]} A new array containing every project whose `id` differs from `id` (the input array is not mutated).
 * @example `deleteProject(projects, "work")` removes the project with ID `work`.
 */
export function deleteProject(projects: Project[], id: string): Project[] {
  return projects.filter((p) => p.id !== id);
}
