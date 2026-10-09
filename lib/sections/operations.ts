import type { Project } from "@/types-and-constants/projects";
import type { Section } from "@/types-and-constants/sections";

/**
 * Trims and saves a section when its name and project assignment are valid.
 * @param sections Existing sections.
 * @param projects Projects used to validate the optional project assignment.
 * @param value Section to insert or replace.
 * @returns {Section[]} The original `sections` array if the trimmed name is empty or the assigned project is missing; otherwise a new array with the trimmed section replacing the same ID or appended when new.
 * @example `saveSection(sections, projects, section)` saves `section` after trimming its name.
 */
export function saveSection(
  sections: Section[],
  projects: Project[],
  value: Section,
): Section[] {
  const section = { ...value, name: value.name.trim() };
  if (
    !section.name ||
    (section.projectId && !projects.some((p) => p.id === section.projectId))
  )
    return sections;
  return sections.some((s) => s.id === section.id)
    ? sections.map((s) => (s.id === section.id ? section : s))
    : [...sections, section];
}

/**
 * Moves a section to another project or to the inbox and assigns its next order.
 * @param sections Existing sections.
 * @param projects Projects used to validate the destination.
 * @param id ID of the section to move.
 * @param projectId Destination project ID, or `null` for the inbox.
 * @returns {Section[]} The original `sections` array if the section is missing, already in that project, or the destination project is missing; otherwise a new array with the moved section assigned the next order in its destination.
 * @example `moveSection(sections, projects, "ideas", null)` moves section `ideas` to the inbox.
 */
export function moveSection(
  sections: Section[],
  projects: Project[],
  id: string,
  projectId: string | null,
): Section[] {
  const section = sections.find((s) => s.id === id);
  if (
    !section ||
    section.projectId === projectId ||
    (projectId && !projects.some((p) => p.id === projectId))
  )
    return sections;
  const order =
    Math.max(
      -1,
      ...sections.filter((s) => s.projectId === projectId).map((s) => s.order),
    ) + 1;
  return sections.map((s) => (s.id === id ? { ...s, projectId, order } : s));
}

/**
 * Checks whether a section can be deleted while preserving its tasks' destination.
 * @param sections Existing sections.
 * @param id ID of the section to delete.
 * @param destination ID of a replacement section, or `null` when no destination is needed.
 * @returns {boolean} `true` when `id` exists and `destination` is falsy or names a different section in the same project; otherwise `false`.
 * @example `canDeleteSection(sections, "ideas", null)` checks deletion without a replacement.
 */
export function canDeleteSection(
  sections: Section[],
  id: string,
  destination: string | null,
): boolean {
  const section = sections.find((s) => s.id === id);
  return (
    !!section &&
    (!destination ||
      sections.some(
        (s) =>
          s.id === destination &&
          s.id !== id &&
          s.projectId === section.projectId,
      ))
  );
}

/**
 * Removes a section by ID.
 * @param sections Existing sections.
 * @param id ID of the section to remove.
 * @returns {Section[]} A new array containing every section whose `id` differs from `id` (the input array is not mutated).
 * @example `deleteSection(sections, "ideas")` removes section `ideas`.
 */
export function deleteSection(sections: Section[], id: string): Section[] {
  return sections.filter((s) => s.id !== id);
}

/**
 * Removes every section assigned to a project.
 * @param sections Existing sections.
 * @param projectId ID of the project being removed.
 * @returns {Section[]} A new array containing every section whose `projectId` differs from `projectId` (the input array is not mutated).
 * @example `removeProjectSections(sections, "work")` removes sections assigned to project `work`.
 */
export function removeProjectSections(
  sections: Section[],
  projectId: string,
): Section[] {
  return sections.filter((s) => s.projectId !== projectId);
}

/**
 * Applies the supplied order to matching sections in one project or the inbox.
 * @param sections Existing sections.
 * @param projectId Project ID to reorder, or `null` for inbox sections.
 * @param ids Section IDs in their new order.
 * @returns {Section[]} A new array where matching sections in `projectId` have `order` set to their index in `ids`; all other section objects are preserved.
 * @example `reorderSections(sections, null, ["next", "ideas"])` puts inbox sections in that order.
 */
export function reorderSections(
  sections: Section[],
  projectId: string | null,
  ids: string[],
): Section[] {
  return sections.map((s) =>
    s.projectId === projectId && ids.includes(s.id)
      ? { ...s, order: ids.indexOf(s.id) }
      : s,
  );
}
