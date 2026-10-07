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

test("field patches retain immediate completion and Undo state", () => {
  const before = state([task("a"), child("b", "a")]);
  const original = get(before, "a");
  const drafts = {
    [original.id]: {
      original,
      changes: { title: "Edited" },
      isNew: false,
      scope: "occurrence",
    },
  };
  const completed = d.reducer(before, {
    type: "complete",
    ref: ref("a"),
    completed: true,
    today: "2026-10-02",
  });
  const saved = d.commitDrafts(completed, drafts);
  assert.equal(get(saved, "a").title, "Edited");
  assert.ok(get(saved, "a").completed);
  assert.ok(get(saved, "b").completed);
  const undone = d.commitDrafts(before, drafts);
  assert.equal(get(undone, "a").completed, false);
});
test("saving a draft never resurrects an immediately deleted task", () => {
  const s = state([task("a")]),
    original = get(s, "a");
  const deleted = d.reducer(s, { type: "delete", id: "a" });
  assert.equal(
    d.commitDrafts(deleted, {
      [original.id]: {
        original,
        changes: { title: "Changed" },
        isNew: false,
        scope: "occurrence",
      },
    }).tasks.length,
    0,
  );
});
test("new parent and nested children save atomically, invalid child rejects entire session", () => {
  const s = state(),
    parent = d.asOccurrence(task("a")),
    sub = d.asOccurrence(child("b", "a"));
  const entries = Object.fromEntries(
    [parent, sub].map((original) => [
      original.id,
      { original, changes: {}, isNew: true, scope: "occurrence" },
    ]),
  );
  assert.equal(d.commitDrafts(s, entries).tasks.length, 2);
  entries[sub.id].changes.title = " ";
  assert.throws(() => d.commitDrafts(s, entries), /title/);
  assert.equal(s.tasks.length, 0);
});
test("occurrence fields are isolated and clearing dates survives persistence", () => {
  let s = state([
    task("a", {
      recurrence: daily,
      schedule: { date: "2026-10-01", duration: 30 },
      deadline: { date: "2026-10-01" },
    }),
  ]);
  const original = get(s, "a", "a");
  s = d.reducer(
    s,
    d.taskDraftAction(
      s,
      original,
      { ...original, title: "Only today", deadline: undefined },
      "occurrence",
    ),
  );
  s = JSON.parse(JSON.stringify(s));
  assert.equal(get(s, "a", "a").deadline, undefined);
  assert.equal(get(s, "a", "a").title, "Only today");
  assert.equal(get(s, "a", "a", "2026-10-03").title, "a");
});
test("child created for one virtual parent does not alter future occurrences", () => {
  const s = state([
    task("a", {
      recurrence: daily,
      schedule: { date: "2026-10-01", duration: 30 },
    }),
  ]);
  const original = d.asOccurrence(child("new", "a"));
  const saved = d.commitDrafts(s, {
    [original.id]: {
      original,
      changes: {},
      isNew: true,
      scope: "occurrence",
      parentRef: ref("a", "a"),
    },
  });
  assert.equal(
    d.occurrenceChildren(
      saved,
      get(saved, "a", "a"),
      d.expandTasks(saved, "2026-10-01", "2026-10-03"),
    ).length,
    1,
  );
  assert.equal(
    d.occurrenceChildren(
      saved,
      get(saved, "a", "a", "2026-10-03"),
      d.expandTasks(saved, "2026-10-01", "2026-10-03"),
    ).length,
    0,
  );
});
test("series editing shifts dates back to template anchor and preserves exceptions", () => {
  let s = state([
    task("a", {
      recurrence: daily,
      schedule: { date: "2026-10-01", duration: 30 },
    }),
  ]);
  s = d.reducer(s, {
    type: "complete",
    ref: ref("a", "a", "2026-10-01"),
    completed: true,
    today: "2026-10-01",
  });
  const original = get(s, "a", "a");
  s = d.reducer(
    s,
    d.taskDraftAction(
      s,
      original,
      { ...original, schedule: { date: "2026-10-03", duration: 60 } },
      "series",
    ),
  );
  assert.equal(s.tasks[0].schedule.date, "2026-10-02");
  assert.ok(Object.values(s.exceptions).some((e) => e.overrides.completed));
});
test("removing recurrence materializes saved subtree history", () => {
  let s = state([
    task("a", {
      recurrence: daily,
      schedule: { date: "2026-10-01", duration: 30 },
    }),
    child("b", "a"),
  ]);
  s = d.reducer(s, {
    type: "complete",
    ref: ref("a", "a"),
    completed: true,
    today: "2026-10-02",
  });
  const original = get(s, "a", "a");
  let i = 0;
  s = d.reducer(
    s,
    d.taskDraftAction(
      s,
      original,
      { ...original, recurrence: undefined },
      "series",
      () => `history${++i}`,
    ),
  );
  assert.equal(s.tasks.length, 4);
  assert.equal(s.tasks.find((t) => t.id === "history2").parentId, "history1");
  assert.deepEqual(s.exceptions, {});
});

test("one-off placement participates in completion, deletion, and persistence", () => {
  let s = state([
    task("a", {
      recurrence: daily,
      schedule: { date: "2026-10-01", duration: 30 },
    }),
  ]);
  const original = d.asOccurrence(child("new", "a"));
  s = d.commitDrafts(s, {
    [original.id]: {
      original,
      changes: {},
      isNew: true,
      scope: "occurrence",
      parentRef: ref("a", "a"),
    },
  });
  s = d.reducer(s, {
    type: "complete",
    ref: ref("a", "a"),
    completed: true,
    today: "2026-10-02",
  });
  assert.ok(get(s, "new").completed);
  const deleted = d.reducer(s, {
    type: "deleteOccurrence",
    ref: ref("a", "a"),
  });
  assert.equal(get(deleted, "new"), undefined);
  assert.ok(get(deleted, "a", "a", "2026-10-03"));
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  d.writeWorkspace(deleted);
  assert.doesNotThrow(() => d.readWorkspace());
  assert.equal(d.reducer(s, { type: "delete", id: "a" }).tasks.length, 0);
});

test("a newly repeating child starts its own context on the parent template", () => {
  const s = state([
    task("a", {
      recurrence: daily,
      schedule: { date: "2026-10-01", duration: 30 },
    }),
  ]);
  const original = d.asOccurrence(
    child("new", "a", {
      recurrence: daily,
      schedule: { date: "2026-10-01", duration: 30 },
    }),
  );
  const saved = d.commitDrafts(s, {
    [original.id]: {
      original,
      changes: {},
      isNew: true,
      scope: "occurrence",
      parentRef: ref("a", "a"),
    },
  });
  assert.equal(saved.tasks.find((t) => t.id === "new").parentId, "a");
  assert.equal(d.occurrenceParent(saved, get(saved, "new", "new")), null);
  assert.equal(
    d
      .expandTasks(saved, "2026-10-01", "2026-10-03")
      .filter((t) => t.taskId === "new").length,
    3,
  );
});
