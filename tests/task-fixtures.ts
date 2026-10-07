import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ts from "typescript";
import { afterAll } from "vitest";

import type {
  Occurrence,
  RecurrenceRule,
  Task,
  TaskReference,
  Workspace,
} from "../lib/tasks/types";

const directory = mkdtempSync(join(tmpdir(), "dayplan-hierarchy-"));
for (const file of readdirSync(new URL("../lib/tasks", import.meta.url)).filter(
  (f) => f.endsWith(".ts"),
)) {
  writeFileSync(
    join(directory, file.replace(/\.ts$/, ".js")),
    ts.transpileModule(
      readFileSync(new URL(`../lib/tasks/${file}`, import.meta.url), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
  );
}

const require = createRequire(import.meta.url);

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
  ...[
    "hierarchy",
    "recurrence",
    "store",
    "editor",
    "operations",
    "drag",
    "selectors",
    "presentation",
    "seed",
  ].map((name) => require(join(directory, name + ".js"))),
) as RuntimeDomain;
afterAll(() => rmSync(directory, { recursive: true, force: true }));

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
