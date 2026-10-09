import type { DateValue } from "@/types-and-constants/dates";
export type Priority = "none" | "low" | "medium" | "high";

export const priorities: Priority[] = ["none", "low", "medium", "high"];

export type Schedule = DateValue & { duration: number };

export type RecurrenceRule = {
  frequency: "daily" | "weekdays" | "weekly" | "monthly";
  weekdays: number[];
  until?: string;
};

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
