import type { TaskMutation } from "@/lib/tasks/mutations";
import { type Project } from "@/types-and-constants/projects";
import { type Section } from "@/types-and-constants/sections";
import { type Tag } from "@/types-and-constants/tags";
import {
  type TaskLayout,
  type Workspace,
} from "@/types-and-constants/workspace";
export type Action =
  | TaskMutation
  | { type: "replace"; state: Workspace }
  | { type: "batch"; actions: Action[] }
  | { type: "entity"; kind: "projects"; entity: Project }
  | { type: "entity"; kind: "tags"; entity: Tag }
  | { type: "moveTag"; id: string; parentId: string | null; beforeId?: string }
  | { type: "deleteEntity"; kind: "projects" | "tags"; id: string }
  | { type: "theme"; theme: Workspace["theme"] }
  | { type: "section"; section: Section }
  | { type: "moveSection"; id: string; projectId: string | null }
  | {
      type: "deleteSection";
      id: string;
      destination: string | null;
      deleteTasks: boolean;
    }
  | { type: "reorderSections"; projectId: string | null; ids: string[] }
  | { type: "layout"; projectId: string | null; layout: TaskLayout }
  | { type: "viewLayout"; view: string; layout: TaskLayout };
