import assert from "node:assert/strict";

import { test } from "vitest";

import type { Occurrence, Task, Workspace } from "../lib/tasks/types";
import {
  child,
  daily,
  domain as d,
  get,
  getMaybe,
  ref,
  state,
  task,
} from "./task-fixtures";

const recurring = () =>
  state([
    task("a", {
      recurrence: daily,
      schedule: { date: "2026-10-01", duration: 30 },
      deadline: { date: "2026-10-04" },
    }),
    child("b", "a"),
    task("z", { order: 1 }),
  ]);

const apply = (s: Workspace, operation: unknown): Workspace =>
  d.reducer(s, d.taskOperationAction(s, operation));

for (const [field, value] of Object.entries({
  priority: "high",
  tagIds: ["tag"],
  deadline: { date: "2026-10-09" },
  schedule: { date: "2026-10-09", time: "09:30", duration: 90 },
})) {
  test(`${field}: quick action, menu and editor share scoped results`, () => {
    for (const scope of ["occurrence", "series"]) {
      const s = recurring(),
        original = get(s, "a", "a"),
        changes = { [field]: value };
      const immediate = apply(s, {
        kind: "edit",
        task: original,
        changes,
        scope,
      });
      const staged = d.commitDrafts(s, {
        [original.id]: { original, changes, scope, isNew: false },
      });
      assert.deepEqual(immediate, staged);
      if (scope === "occurrence")
        assert.deepEqual(
          get(immediate, "a", "a", "2026-10-03")[field as keyof Task],
          get(s, "a", "a", "2026-10-03")[field as keyof Task],
        );
      else
        assert.notDeepEqual(
          immediate.tasks[0][field as keyof Task],
          s.tasks[0][field as keyof Task],
        );
    }
  });
}

test("recurrence edits reject occurrence scope and invalid clear remains atomic", () => {
  const s = recurring(),
    original = get(s, "a", "a");
  assert.throws(
    () =>
      apply(s, {
        kind: "edit",
        task: original,
        scope: "occurrence",
        changes: { recurrence: undefined },
      }),
    /Entire series/,
  );
  assert.throws(
    () =>
      apply(s, {
        kind: "edit",
        task: original,
        scope: "series",
        changes: { schedule: undefined, deadline: undefined },
      }),
    /date/,
  );
  const updated = apply(s, {
    kind: "edit",
    task: original,
    scope: "occurrence",
    changes: { deadline: undefined },
  });
  assert.equal(get(updated, "a", "a").deadline, undefined);
  assert.ok(get(updated, "a", "a", "2026-10-03").deadline);
});

test("structural drag and editor edits target templates without materializing occurrences", () => {
  const s = recurring(),
    original = get(s, "b", "a");
  const action = d.taskAction(s, {
    type: "moveTask",
    task: original,
    parentRef: null,
    projectId: null,
    sectionId: null,
  });
  const moved = d.reducer(s, action);
  assert.equal(moved.tasks.length, s.tasks.length);
  assert.equal(moved.tasks.find((t) => t.id === "b")!.parentId, null);
  assert.equal(moved.tasks.find((t) => t.id === "b")!.projectId, null);
  assert.deepEqual(moved.exceptions, {});
  const edited = d.reducer(
    s,
    d.taskDraftAction(
      s,
      original,
      { ...original, parentId: null, projectId: null, sectionId: null },
      "occurrence",
    ),
  );
  assert.deepEqual(edited, moved);
  assert.throws(
    () =>
      apply(s, {
        kind: "move",
        task: get(s, "a", "a"),
        parentId: "b",
        projectId: "p",
        sectionId: "a",
      }),
    /subtree/,
  );
});

test("completion and deletion target occurrences, archive targets templates and preserves child flags", () => {
  const s = recurring();
  s.tasks.find((t) => t.id === "b")!.archived = true;
  const completed = apply(s, {
    kind: "complete",
    task: get(s, "a", "a"),
    completed: true,
    today: "2026-10-02",
  });
  assert.equal(get(completed, "a", "a").completed, true);
  assert.equal(get(completed, "a", "a", "2026-10-03").completed, false);
  const archived = apply(s, {
    kind: "archive",
    task: get(s, "a", "a"),
    archived: true,
  });
  const restored = apply(archived, {
    kind: "archive",
    task: get(archived, "a", "a"),
    archived: false,
  });
  assert.deepEqual(restored, s);
  assert.equal(get(restored, "b", "a").archived, true);
  const deleted = apply(s, {
    kind: "delete",
    task: get(s, "a", "a"),
    scope: "occurrence",
  });
  assert.equal(getMaybe(deleted, "b", "a"), undefined);
  assert.ok(get(deleted, "b", "a", "2026-10-03"));
  assert.deepEqual(
    apply(s, {
      kind: "delete",
      task: get(s, "a", "a"),
      scope: "series",
    }).tasks.map((t) => t.id),
    ["z"],
  );
});

test("duplicate snapshots effective subtree fields, resets identities, and inserts after source", () => {
  let s = recurring();
  s = d.reducer(s, {
    type: "patch",
    ref: ref("a", "a"),
    changes: {
      title: "Effective title",
      priority: "high",
      completed: true,
      schedule: { date: "2026-10-08", time: "13:00", duration: 60 },
    },
  });
  const original = get(s, "a", "a");
  const all = d.expandTasks(s, "2026-10-01", "2026-10-09");
  let id = 0;
  const next = d.reducer(
    s,
    d.duplicateTaskAction(
      s,
      original,
      all,
      true,
      () => `copy${++id}`,
      "2026-10-07T12:00:00Z",
    ),
  );
  const root = next.tasks.find((t) => t.id === "copy1")!,
    childCopy = next.tasks.find((t) => t.id === "copy2")!;
  assert.equal(next.tasks.length, s.tasks.length + 2);
  assert.equal(root.title, "Effective title");
  assert.deepEqual(root.schedule, original.schedule);
  assert.deepEqual(root.deadline, original.deadline);
  assert.equal(childCopy.parentId, root.id);
  for (const copy of [root, childCopy] as (Task & Partial<Occurrence>)[]) {
    assert.equal(copy.completed, false);
    assert.equal(copy.archived, false);
    assert.equal(copy.recurrence, undefined);
    assert.equal("context" in copy, false);
    assert.equal("taskId" in copy, false);
    assert.equal(copy.createdAt, "2026-10-07T12:00:00Z");
  }
  assert.deepEqual(next.exceptions, s.exceptions);
  assert.deepEqual(
    next.tasks
      .filter((t) => !t.parentId)
      .sort((a, b) => a.order - b.order)
      .map((t) => t.id),
    ["a", "copy1", "z"],
  );
  assert.deepEqual(d.reducer(next, { type: "replace", state: s }), s);
});

test("duplicate under active sorting leaves existing ranks unchanged and copies independent child only once", () => {
  const s = recurring();
  s.tasks.push(
    child("independent", "a", {
      recurrence: daily,
      schedule: { date: "2026-10-01", duration: 30 },
    }),
  );
  let id = 0;
  const next = d.reducer(
    s,
    d.duplicateTaskAction(
      s,
      get(s, "a", "a"),
      d.expandTasks(s, "2026-10-01", "2026-10-09"),
      false,
      () => `copy${++id}`,
    ),
  );
  assert.equal(next.tasks.length, s.tasks.length + 3);
  for (const source of s.tasks)
    assert.equal(
      next.tasks.find((t) => t.id === source.id)!.order,
      source.order,
    );
  assert.equal(
    next.tasks.filter((t) => t.id.startsWith("copy") && t.recurrence).length,
    0,
  );
});

test("duplicate excludes descendants placed outside the selected effective subtree", () => {
  let s = recurring();
  const moved = get(s, "b", "a");
  s = {
    ...s,
    exceptions: {
      [moved.id]: { ...ref("b", "a"), overrides: {}, parentRef: ref("z") },
    },
  };
  let id = 0;
  const next = d.reducer(
    s,
    d.duplicateTaskAction(
      s,
      get(s, "a", "a"),
      d.expandTasks(s, "2026-10-01", "2026-10-04"),
      true,
      () => `copy${++id}`,
    ),
  );
  assert.equal(next.tasks.length, s.tasks.length + 1);
});
