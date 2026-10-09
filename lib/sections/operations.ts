import type { Project } from "@/types-and-constants/projects";
import type { Section } from "@/types-and-constants/sections";
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
export function deleteSection(sections: Section[], id: string): Section[] {
  return sections.filter((s) => s.id !== id);
}
export function removeProjectSections(
  sections: Section[],
  projectId: string,
): Section[] {
  return sections.filter((s) => s.projectId !== projectId);
}
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
