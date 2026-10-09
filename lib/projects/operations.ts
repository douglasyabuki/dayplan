import type { Project } from "@/types-and-constants/projects";
export function saveProject(projects: Project[], project: Project): Project[] {
  return projects.some((p) => p.id === project.id)
    ? projects.map((p) => (p.id === project.id ? project : p))
    : [...projects, project];
}
export function deleteProject(projects: Project[], id: string): Project[] {
  return projects.filter((p) => p.id !== id);
}
