import * as drag from "@/lib/tasks/drag";
import * as editor from "@/lib/tasks/editor";
import * as factory from "@/lib/tasks/factory";
import * as hierarchy from "@/lib/tasks/hierarchy";
import * as mutations from "@/lib/tasks/mutations";
import * as operations from "@/lib/tasks/operations";
import * as presentation from "@/lib/tasks/presentation";
import * as recurrence from "@/lib/tasks/recurrence";
import * as grouping from "@/lib/workspace/grouping";
import * as seed from "@/lib/workspace/seed";
import * as selectors from "@/lib/workspace/selectors";
import * as commands from "@/stores/workspace/commands";
import * as persistence from "@/stores/workspace/persistence";
import * as reducer from "@/stores/workspace/reducer";
import type {
  Occurrence,
  RecurrenceRule,
  Task,
  TaskReference,
} from "@/types-and-constants/tasks";
import type { Workspace } from "@/types-and-constants/workspace";
/* eslint-disable @typescript-eslint/no-explicit-any */
type RuntimeDomain = {
  [name: string]: any;
  reducer: (workspace: Workspace, action: any) => Workspace;
  expandTasks: (...args: any[]) => Occurrence[];
  occurrenceChildren: (...args: any[]) => Occurrence[];
  seedWorkspace: (...args: any[]) => Workspace;
  commitDrafts: (...args: any[]) => Workspace;
  taskPreviewEntries: (
    ...args: any[]
  ) => { task: Occurrence; preview: boolean }[];
  previewOrder: <T extends { id: string }>(items: T[], destination: any) => T[];
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export const domain = Object.assign(
  {},
  persistence,
  mutations,
  grouping,
  hierarchy,
  recurrence,
  reducer,
  editor,
  operations,
  commands,
  drag,
  selectors,
  presentation,
  seed,
  factory,
) as RuntimeDomain;
export const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  parentId: null,
  title: id,
  description: "",
  projectId: "p",
  sectionId: "a",
  priority: "none",
  tagIds: [],
  completed: false,
  archived: false,
  order: 0,
  createdAt: "2026-10-01",
  ...extra,
});

export const child = (
  id: string,
  parentId: string,
  extra: Partial<Task> = {},
): Task => task(id, { parentId, projectId: null, sectionId: null, ...extra });

export const state = (tasks: Task[] = []): Workspace => ({
  version: 2,
  tasks,
  exceptions: {},
  sections: ["a", "b"].map((id, order) => ({
    id,
    order,
    name: id,
    projectId: "p",
  })),
  projects: [{ id: "p", name: "Project", color: "sky" }],
  tags: [],
  layouts: {},
  timezone: "UTC",
  theme: "system",
});

export const daily: RecurrenceRule = { frequency: "daily", weekdays: [] };

export const ref = (
  taskId: string,
  root?: string,
  date = "2026-10-02",
): TaskReference => ({
  taskId,
  ...(root
    ? { context: { recurrenceRootTaskId: root, occurrenceDate: date } }
    : {}),
});

export const get = (
  s: Workspace,
  taskId: string,
  root?: string,
  date?: string,
): Occurrence => {
  const occurrence = domain.resolveOccurrence(s, ref(taskId, root, date));
  if (!occurrence)
    throw new Error(`Task ${taskId} was not found in the fixture`);
  return occurrence;
};

export const getMaybe = (
  s: Workspace,
  taskId: string,
  root?: string,
  date?: string,
): Occurrence | undefined =>
  domain.resolveOccurrence(s, ref(taskId, root, date));
