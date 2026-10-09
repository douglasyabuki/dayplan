import type { Project } from "@/types-and-constants/projects";
import type { Tag } from "@/types-and-constants/tags";
export type CollectionDialogState =
  | { kind: "projects"; entity?: Project }
  | { kind: "tags"; entity?: Tag; parentId?: string | null; mode?: "move" };
