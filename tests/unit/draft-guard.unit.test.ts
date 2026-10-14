import { expect, test } from "vitest";

import type { DraftEntry } from "@/lib/tasks/editor";
import {
  assertDraftsCurrent,
  contentKey,
  draftCanApply,
  draftKey,
} from "@/stores/workspace/draft-guard";

import { child, daily, get, state, task } from "../task-fixtures";

test("unrelated edits do not invalidate drafts; any underlying field change does", () => {
  const before = state([task("a"), task("b")]);
  const entry: DraftEntry = {
    original: get(before, "a"),
    changes: { title: "Draft" },
    isNew: false,
    scope: "occurrence",
  };
  const expected = { entry, key: draftKey(before, entry) };
  const unrelated = {
    ...before,
    tasks: before.tasks.map((t) =>
      t.id === "b" ? { ...t, description: "Remote" } : t,
    ),
  };
  expect(() => assertDraftsCurrent(unrelated, [expected])).not.toThrow();
  const changed = {
    ...before,
    tasks: before.tasks.map((t) =>
      t.id === "a" ? { ...t, description: "Remote" } : t,
    ),
  };
  expect(() => assertDraftsCurrent(changed, [expected])).toThrow(/Review/);
  expect(() =>
    assertDraftsCurrent(changed, [{ entry, key: draftKey(changed, entry) }]),
  ).not.toThrow();
});

test("parent, deep subtree, and recurrence exceptions are baseline dependencies", () => {
  const before = state([
    task("a", {
      recurrence: daily,
      schedule: { date: "2026-10-01", duration: 30 },
    }),
    child("b", "a"),
    child("c", "b"),
  ]);
  const entry: DraftEntry = {
    original: get(before, "a", "a", "2026-10-02"),
    changes: { title: "Draft" },
    isNew: false,
    scope: "occurrence",
  };
  const changed = {
    ...before,
    tasks: before.tasks.map((t) =>
      t.id === "c" ? { ...t, completed: true } : t,
    ),
  };
  expect(draftKey(changed, entry)).not.toBe(draftKey(before, entry));
  const exception = {
    ...before,
    exceptions: {
      ...before.exceptions,
      remote: {
        taskId: "a",
        context: entry.original.context,
        overrides: { description: "Remote" },
      },
    },
  };
  expect(draftKey(exception, entry)).not.toBe(draftKey(before, entry));
  const nested: DraftEntry = {
    original: get(before, "b", "a", "2026-10-02"),
    changes: {},
    isNew: false,
    scope: "occurrence",
  };
  const parentChanged = {
    ...before,
    tasks: before.tasks.map((t) =>
      t.id === "a" ? { ...t, title: "New parent" } : t,
    ),
  };
  expect(draftKey(parentChanged, nested)).not.toBe(draftKey(before, nested));
});

test("deleted tasks and invalid parents cannot be approved for implicit recreation", () => {
  const before = state([task("a"), child("b", "a")]);
  const entry: DraftEntry = {
    original: get(before, "b"),
    changes: { title: "Draft" },
    isNew: false,
    scope: "occurrence",
  };
  expect(draftCanApply(state(), entry)).toBe(false);
  const added = { ...entry, isNew: true };
  expect(draftCanApply(state(), added)).toBe(false);
  expect(draftCanApply(state(), added, new Set(["a"]))).toBe(true);
});

test("content comparison ignores property order, but detects workspace changes", () => {
  expect(contentKey({ a: 1, b: 2 })).toBe(contentKey({ b: 2, a: 1 }));
  expect(contentKey(state([task("a")]))).not.toBe(contentKey(state()));
});
