import type { Project } from "@/types-and-constants/projects";
import type { Section } from "@/types-and-constants/sections";
import type { Tag } from "@/types-and-constants/tags";
import type { OccurrenceException, Task } from "@/types-and-constants/tasks";
export type TaskLayout = "list" | "board";

export type Workspace = {
  version: 2;
  timezone: string;
  tasks: Task[];
  projects: Project[];
  tags: Tag[];
  exceptions: Record<string, OccurrenceException>;
  theme: "system" | "light" | "dark";
  sections: Section[];
  layouts: Record<string, TaskLayout>;
};
