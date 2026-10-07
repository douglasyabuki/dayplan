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
);
afterAll(() => rmSync(directory, { recursive: true, force: true }));

export const task = (id, extra = {}) => ({
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

export const child = (id, parentId, extra = {}) =>
  task(id, { parentId, projectId: null, sectionId: null, ...extra });

export const state = (tasks = []) => ({
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

export const daily = { frequency: "daily", weekdays: [] };

export const ref = (taskId, root, date = "2026-10-02") => ({
  taskId,
  ...(root
    ? { context: { recurrenceRootTaskId: root, occurrenceDate: date } }
    : {}),
});

export const get = (s, taskId, root, date) =>
  domain.resolveOccurrence(s, ref(taskId, root, date));
