import { expect, test } from "vitest";

import { referenceKey } from "@/lib/tasks/recurrence";
import { reducer } from "@/stores/workspace/reducer";
import { validateWorkspace } from "@/stores/workspace/validation";
import { child, daily, state, task } from "@/tests/task-fixtures";

test("project deletion cleans sections and occurrence placement in one immutable transition", () => {
  const original = state([
    task("root", {
      recurrence: daily,
      schedule: { date: "2026-10-01", duration: 30 },
    }),
    child("child", "root"),
    task("inbox", { projectId: null, sectionId: null }),
  ]);
  const ref = {
    taskId: "root",
    context: { recurrenceRootTaskId: "root", occurrenceDate: "2026-10-02" },
  };
  original.exceptions[referenceKey(ref)] = {
    ...ref,
    overrides: { projectId: "p", sectionId: "a", title: "Exception" },
  };
  const before = structuredClone(original);
  const result = reducer(original, {
    type: "deleteEntity",
    kind: "projects",
    id: "p",
  });
  expect(result.projects.some((p) => p.id === "p")).toBe(false);
  expect(result.sections.some((s) => s.projectId === "p")).toBe(false);
  expect(result.tasks[0]).toMatchObject({ projectId: null, sectionId: null });
  expect(result.tasks[1]).toBe(original.tasks[1]);
  expect(result.tasks[2]).toBe(original.tasks[2]);
  expect(result.exceptions[referenceKey(ref)].overrides).toEqual({
    projectId: null,
    sectionId: null,
    title: "Exception",
  });
  expect(validateWorkspace(JSON.parse(JSON.stringify(result)))).toEqual(result);
  expect(original).toEqual(before);
});
