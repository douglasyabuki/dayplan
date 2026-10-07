import assert from "node:assert/strict";
import { test } from "node:test";

import {
  child,
  daily,
  domain as d,
  get,
  ref,
  state,
  task,
} from "./task-fixtures.mjs";

test("location is derived, and moving a root does not rewrite descendants", () => {
  const s = state([task("a"), child("b", "a"), child("c", "b")]);
  const moved = d.reducer(s, {
    type: "patch",
    ref: ref("a"),
    changes: { sectionId: "b" },
  });
  assert.equal(get(moved, "c").sectionId, "b");
  assert.equal(moved.tasks[1], s.tasks[1]);
  assert.equal(moved.tasks[1].sectionId, null);
  assert.throws(
    () =>
      d.reducer(s, {
        type: "patch",
        ref: ref("a"),
        changes: { parentId: "c" },
      }),
    /hierarchy/,
  );
  assert.throws(
    () => d.reducer(s, { type: "save", task: child("x", "missing") }),
    /hierarchy/,
  );
});
test("completion cascades down, reopening cascades up, siblings stay unchanged", () => {
  let s = state([task("a"), child("b", "a"), child("c", "b"), child("d", "a")]);
  s = d.reducer(s, {
    type: "complete",
    ref: ref("a"),
    completed: true,
    today: "2026-10-02",
  });
  assert.ok(s.tasks.every((t) => t.completed));
  s = d.reducer(s, {
    type: "complete",
    ref: ref("c"),
    completed: false,
    today: "2026-10-02",
  });
  assert.deepEqual(
    s.tasks.map((t) => t.completed),
    [false, false, false, true],
  );
  s = d.reducer(s, {
    type: "complete",
    ref: ref("c"),
    completed: true,
    today: "2026-10-02",
  });
  assert.equal(get(s, "a").completed, false);
});
test("archive inheritance preserves independently archived children", () => {
  let s = state([
    task("a"),
    child("b", "a", { archived: true }),
    child("c", "a"),
  ]);
  s = d.reducer(s, { type: "archive", id: "a", archived: true });
  assert.ok(get(s, "c").archived);
  s = d.reducer(s, { type: "archive", id: "a", archived: false });
  assert.ok(get(s, "b").archived);
  assert.equal(get(s, "c").archived, false);
});
test("delete removes the subtree and Undo restores the exact previous workspace", () => {
  const s = state([task("a"), child("b", "a"), child("c", "b"), task("other")]);
  const next = d.reducer(s, { type: "delete", id: "a" });
  assert.deepEqual(
    next.tasks.map((t) => t.id),
    ["other"],
  );
  assert.equal(d.reducer(next, { type: "replace", state: s }), s);
});
test("new storage ignores legacy keys and round trips the new schema", () => {
  const values = new Map([["dayplan.workspace.v1", "not json"]]);
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(d.readWorkspace(), null);
  const s = state([task("a"), child("b", "a")]);
  d.writeWorkspace(s);
  assert.deepEqual(d.readWorkspace(), s);
  values.set(
    d.STORAGE_KEY,
    JSON.stringify(state([child("broken", "missing")])),
  );
  assert.throws(() => d.readWorkspace());
  assert.equal(values.get("dayplan.workspace.v1"), "not json");
});
test("section deletion moves root tasks while preserving child inheritance", () => {
  const s = state([task("a"), child("b", "a")]);
  const moved = d.reducer(s, {
    type: "deleteSection",
    id: "a",
    destination: "b",
    deleteTasks: false,
  });
  assert.equal(get(moved, "b").sectionId, "b");
  assert.equal(moved.tasks[1].sectionId, null);
  assert.equal(
    d.reducer(s, {
      type: "deleteSection",
      id: "a",
      destination: null,
      deleteTasks: true,
    }).tasks.length,
    0,
  );
});
test("seed contains valid full children and independent recurrence boundaries", () => {
  const s = d.seedWorkspace();
  d.validateHierarchy(s.tasks);
  assert.equal(s.version, 2);
  assert.ok(s.tasks.some((t) => t.parentId && t.recurrence));
  assert.ok(
    s.tasks.some(
      (t) => t.parentId && s.tasks.find((p) => p.id === t.parentId)?.parentId,
    ),
  );
  assert.ok(s.tasks.every((t) => !("checklist" in t)));
});
test("instances remain virtual and explicit identity handles special task IDs", () => {
  const id = 'task@odd/["id"]';
  const s = state([
    task(id, {
      recurrence: daily,
      schedule: { date: "2026-10-01", duration: 30 },
    }),
    child("b", id),
  ]);
  const all = d.expandTasks(s, "2026-10-01", "2026-10-03");
  assert.equal(all.length, 6);
  assert.equal(s.tasks.length, 2);
  assert.deepEqual(s.exceptions, {});
  assert.deepEqual(d.parseReference(get(s, id, id).id), ref(id, id));
  assert.equal(get(s, "b", id).completed, false);
});
test("independent recurrence starts a context inherited only by its own descendants", () => {
  const s = state([
    task("a", {
      recurrence: daily,
      schedule: { date: "2026-10-01", duration: 30 },
    }),
    child("b", "a", {
      recurrence: daily,
      schedule: { date: "2026-10-01", duration: 30 },
    }),
    child("c", "b"),
  ]);
  const all = d.expandTasks(s, "2026-10-01", "2026-10-03");
  assert.equal(all.length, 9);
  assert.equal(d.occurrenceParent(s, get(s, "b", "b")), null);
  assert.deepEqual(d.occurrenceParent(s, get(s, "c", "b")), ref("b", "b"));
  assert.equal(d.resolveOccurrence(s, ref("c", "a")), undefined);
});
test("completion cutoff and reopening do not cross independent recurrence boundaries", () => {
  let s = state([
    task("a", {
      recurrence: daily,
      schedule: { date: "2026-10-01", duration: 30 },
    }),
    child("b", "a", {
      recurrence: daily,
      schedule: { date: "2026-10-01", duration: 30 },
    }),
    child("c", "b"),
  ]);
  s = d.reducer(s, {
    type: "complete",
    ref: ref("a", "a"),
    completed: true,
    today: "2026-10-02",
  });
  assert.ok(get(s, "b", "b").completed);
  assert.ok(get(s, "c", "b").completed);
  assert.equal(get(s, "b", "b", "2026-10-03").completed, false);
  s = d.reducer(s, {
    type: "complete",
    ref: ref("c", "b"),
    completed: false,
    today: "2026-10-02",
  });
  assert.equal(get(s, "b", "b").completed, false);
  assert.ok(get(s, "a", "a").completed);
});
test("detachment suppresses one inherited subtree and excludes independent contexts", () => {
  const s = state([
    task("a", {
      recurrence: daily,
      schedule: { date: "2026-10-01", duration: 30 },
    }),
    child("b", "a"),
    child("c", "b"),
    child("independent", "b", {
      recurrence: daily,
      schedule: { date: "2026-10-01", duration: 30 },
    }),
  ]);
  let count = 0;
  const result = d.materializeSubtree(
    s,
    get(s, "b", "a"),
    "p",
    "b",
    () => `new${++count}`,
  );
  assert.equal(result.state.tasks.length, 6);
  assert.equal(result.root.parentId, null);
  assert.equal(get(result.state, "b", "a"), undefined);
  assert.ok(get(result.state, "b", "a", "2026-10-03"));
  assert.ok(get(result.state, "independent", "independent"));
  assert.equal(get(result.state, "new2").parentId, "new1");
  assert.equal(get(result.state, "new2").sectionId, "b");
});
