export type Priority = "none" | "low" | "medium" | "high";

export type DateValue = { date: string; time?: string };

export type Schedule = DateValue & { duration: number };

export type RecurrenceRule = {
  frequency: "daily" | "weekdays" | "weekly" | "monthly";
  weekdays: number[];
  until?: string;
};

export type Project = { id: string; name: string; color: string };

export type Tag = Project;

export type Section = {
  id: string;
  name: string;
  projectId: string | null;
  order: number;
};

export type TaskLayout = "list" | "board";

/**
 * Returns the stable layout-storage key for a project container.
 * @param projectId Project ID, or `null` for the inbox.
 * @returns `inbox` for the inbox, otherwise a `project:<id>` key.
 * @example `containerKey(null)` returns `"inbox"`.
 */
export const containerKey = (projectId: string | null) =>
  projectId === null ? "inbox" : `project:${projectId}`;

export type Task = {
  id: string;
  parentId: string | null;
  title: string;
  description: string;
  projectId: string | null;
  sectionId: string | null;
  tagIds: string[];
  priority: Priority;
  deadline?: DateValue;
  schedule?: Schedule;
  recurrence?: RecurrenceRule;
  completed: boolean;
  archived: boolean;
  order: number;
  createdAt: string;
};

export type OccurrenceContext = {
  recurrenceRootTaskId: string;
  occurrenceDate: string;
};
export type TaskReference = { taskId: string; context?: OccurrenceContext };
/** id is a serialized reference for presentation; taskId always identifies the template. */
export type Occurrence = Task & TaskReference;

export type OccurrenceException = TaskReference & {
  overrides: Partial<Task>;
  cleared?: (keyof Task)[];
  deleted?: boolean;
  parentRef?: TaskReference | null;
};

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

export const priorities: Priority[] = ["none", "low", "medium", "high"];

export const colors = ["indigo", "emerald", "amber", "rose", "sky", "violet"];
