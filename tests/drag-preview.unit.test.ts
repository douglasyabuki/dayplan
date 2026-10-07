import assert from "node:assert/strict";

import { test } from "vitest";

import type { DragDestination } from "../lib/tasks/drag";
import { child, domain as d, get, ref, state, task } from "./task-fixtures";

const workspace = state([
  task("source", { sectionId: "a" }),
  task("first", { sectionId: "b", order: 0 }),
  task("last", { sectionId: "b", order: 1 }),
  child("nested", "first"),
]);
const source = get(workspace, "source");
const all = d.expandTasks(workspace, "2026-10-01", "2026-10-02");
const resolve = (
  data: Record<string, unknown>,
  intent: "before" | "after" | "inside",
): DragDestination | null =>
  d.dragDestination({
    sourceData: { taskId: source.id },
    data,
    intent,
    after: intent === "after",
    manual: true,
    sections: workspace.sections,
    projectId: "p",
    allTasks: all,
    visible: all,
    state: workspace,
  });
const roots = [get(workspace, "first"), get(workspace, "last")];

test("incoming section previews match the drop order at the start, middle and end", () => {
  for (const [target, intent] of [
    ["first", "before"],
    ["first", "after"],
    ["last", "after"],
  ] as const) {
    const destination = resolve({ taskId: get(workspace, target).id }, intent);
    const preview = d.taskPreviewEntries(roots, source, destination, {
      projectId: "p",
      sectionId: "b",
    });
    assert.deepEqual(
      preview.map((e) => e.task.id),
      destination!.ids,
    );
    assert.deepEqual(
      preview.filter((e) => e.preview).map((e) => e.task.id),
      [source.id],
    );
    assert.ok(
      preview.filter((e) => !e.preview).every((e) => roots.includes(e.task)),
    );
    // The original sortable remains mounted in its original list.
    assert.deepEqual(
      d.taskPreviewEntries([source], source, destination, {
        projectId: "p",
        sectionId: "a",
      }),
      [{ task: source, preview: false }],
    );
  }
});

test("empty sections preview in their own location, while nesting keeps parents unchanged", () => {
  const destination = resolve(
    { kind: "section-target", sectionId: null },
    "after",
  );
  assert.equal(
    d.taskPreviewEntries([], source, destination, {
      projectId: "p",
      sectionId: null,
    }).length,
    1,
  );
  assert.equal(
    d.taskPreviewEntries([], source, destination, {
      projectId: "p",
      sectionId: "b",
    }).length,
    0,
  );
  assert.equal(
    d.taskPreviewEntries([], source, destination, {
      projectId: null,
      sectionId: null,
    }).length,
    0,
  );
  const nested = resolve({ taskId: get(workspace, "nested").id }, "inside");
  assert.equal(
    d.taskPreviewEntries([], source, nested, {
      parentRef: ref("nested"),
      projectId: "p",
      sectionId: "b",
    }).length,
    0,
  );
  assert.equal(
    d.taskPreviewEntries([], source, nested, {
      parentRef: ref("first"),
      projectId: "p",
      sectionId: "b",
    }).length,
    0,
  );
});

test("nesting preserves existing children while positional moves preview their slot", () => {
  const children = [get(workspace, "nested")];
  const location = { parentRef: ref("first"), projectId: "p", sectionId: "b" };
  for (const destination of [
    resolve({ taskId: get(workspace, "first").id }, "inside"),
    resolve({ taskId: children[0].id }, "before"),
  ]) {
    const preview = d.taskPreviewEntries(
      children,
      source,
      destination,
      location,
    );
    assert.deepEqual(
      preview.map((e) => e.task.id),
      destination!.intent === "inside"
        ? children.map((task) => task.id)
        : destination!.ids,
    );
    assert.equal(
      preview.filter((e) => e.preview).length,
      destination!.intent === "inside" ? 0 : 1,
    );
    assert.deepEqual(
      d.taskPreviewEntries(children, source, null, location),
      children.map((task) => ({ task, preview: false })),
    );
  }
});

test("switching destinations and returning to source removes the previous preview", () => {
  const before = structuredClone(workspace);
  const section = resolve({ taskId: roots[0].id }, "before");
  const nested = resolve({ taskId: roots[0].id }, "inside");
  const location = { projectId: "p", sectionId: "b" };
  assert.equal(
    d.taskPreviewEntries(roots, source, section, location).length,
    3,
  );
  assert.equal(d.taskPreviewEntries(roots, source, nested, location).length, 2);
  assert.equal(d.taskPreviewEntries(roots, source, null, location).length, 2);
  assert.deepEqual(workspace, before);
});

test("grouped views preview only the target group, and sibling previews remain real rows", () => {
  const destination = resolve({ taskId: roots[0].id }, "before");
  assert.equal(d.taskPreviewEntries(roots, source, destination).length, 3);
  assert.equal(
    d.taskPreviewEntries([get(workspace, "nested")], source, destination)
      .length,
    1,
  );
  const local: DragDestination = {
    kind: "task",
    intent: "before",
    ids: [roots[1].id, roots[0].id],
  };
  const preview = d.taskPreviewEntries(roots, roots[1], local);
  assert.deepEqual(
    preview.map((e) => e.task.id),
    local.ids,
  );
  assert.ok(preview.every((e) => !e.preview));
});
