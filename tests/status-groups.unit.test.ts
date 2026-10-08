import assert from "node:assert/strict";

import { test } from "vitest";

import type { DragDestination } from "../lib/tasks/drag";
import type { Workspace } from "../lib/tasks/types";
import {
  child,
  daily,
  domain as d,
  get,
  ref,
  state,
  task,
} from "./task-fixtures";

const initial = state([
  task("parent"),
  child("open", "parent", { order: 0 }),
  child("done", "parent", { completed: true, order: 1 }),
  child("grandchild", "open"),
  task("other", { sectionId: "b" }),
]);
const expand = (s: Workspace) => d.expandTasks(s, "2026-10-01", "2026-10-03");
function destination(
  s: Workspace,
  source: string,
  parent: string | null,
  completed: boolean,
  extra = {},
) {
  return d.dragDestination({
    sourceData: { kind: "section-task", taskId: get(s, source).id },
    data: {
      kind: "status-group",
      parentRef: parent ? ref(parent) : null,
      projectId: "p",
      sectionId: "a",
      completed,
    },
    after: false,
    manual: true,
    sections: s.sections,
    projectId: "p",
    allTasks: expand(s),
    visible: expand(s),
    state: s,
    ...extra,
  }) as DragDestination | null;
}
function commit(s: Workspace, source: string, dest: DragDestination) {
  return d.reducer(
    s,
    d.taskDropAction(s, get(s, source), dest, expand(s), "2026-10-02"),
  );
}

test("same-parent status drops preserve every parent and order, and complete descendants", () => {
  const dest = destination(initial, "open", "parent", true)!;
  assert.equal(dest.statusOnly, true);
  const next = commit(initial, "open", dest);
  assert.equal(get(next, "open").completed, true);
  assert.equal(get(next, "grandchild").completed, true);
  assert.deepEqual(
    next.tasks.map((t) => [t.id, t.parentId, t.order]),
    initial.tasks.map((t) => [t.id, t.parentId, t.order]),
  );
  assert.equal(get(initial, "open").completed, false);
  assert.equal(destination(next, "open", "parent", true), null);
  const reopened = commit(
    next,
    "open",
    destination(next, "open", "parent", false)!,
  );
  assert.equal(get(reopened, "open").parentId, "parent");
  assert.equal(get(reopened, "open").completed, false);
});

test("cross-parent status drop is atomic; title nesting preserves status", () => {
  const dest = destination(initial, "open", "other", true)!;
  assert.equal(dest.parentRef?.taskId, "other");
  assert.equal(dest.sectionId, "b");
  const next = commit(initial, "open", dest);
  assert.equal(get(next, "open").parentId, "other");
  assert.equal(get(next, "open").completed, true);
  assert.deepEqual(
    d.reducer(next, { type: "replace", state: initial }),
    initial,
  );
  const nested = destination(initial, "open", "parent", true, {
    data: {
      kind: "section-task",
      taskId: get(initial, "done").id,
      completed: true,
    },
    intent: "inside",
  })!;
  assert.equal(nested.completed, undefined);
  assert.equal(get(commit(initial, "open", nested), "open").completed, false);
});

test("empty root and nested groups accept drops; cycles, archived sources and cancellation do not", () => {
  assert.equal(destination(initial, "open", null, true)?.parentRef, null);
  assert.equal(
    destination(initial, "done", "other", false)?.parentRef?.taskId,
    "other",
  );
  assert.equal(destination(initial, "parent", "grandchild", true), null);
  assert.equal(destination(initial, "open", "open", true), null);
  assert.equal(
    destination(initial, "open", "parent", true, { canceled: true }),
    null,
  );
  const archived = state(
    initial.tasks.map((t) => (t.id === "open" ? { ...t, archived: true } : t)),
  );
  assert.equal(destination(archived, "open", "parent", true), null);
});

test("preview matches both parent and status and excludes descendants from sibling lists", () => {
  const source = get(initial, "open");
  const dest = destination(initial, "open", "other", true)!;
  for (const parent of ["parent", "other"])
    for (const completed of [false, true]) {
      const entries = d.taskPreviewEntries([], source, dest, {
        parentRef: ref(parent),
        projectId: "p",
        sectionId: "b",
        completed,
      });
      assert.equal(
        entries.filter((e) => e.preview).length,
        Number(parent === "other" && completed),
      );
    }
  assert.equal(
    d.occurrenceChildren(initial, get(initial, "parent"), expand(initial))
      .length,
    2,
  );
});

test("position drops adopt status, guard hidden siblings, and respect automatic sorting", () => {
  const options = {
    data: {
      kind: "section-task",
      taskId: get(initial, "done").id,
      completed: true,
    },
    intent: "before",
  };
  const dest = destination(initial, "open", "parent", true, options)!;
  assert.equal(dest.completed, true);
  assert.equal(get(commit(initial, "open", dest), "open").completed, true);
  assert.equal(
    destination(initial, "open", "parent", true, { ...options, manual: false }),
    null,
  );
  assert.ok(destination(initial, "open", "parent", true, { manual: false }));
  const hidden = state([
    ...initial.tasks,
    child("hidden", "parent", { completed: true, order: 2 }),
  ]);
  assert.equal(
    destination(hidden, "open", "parent", true, {
      ...options,
      visible: expand(initial),
    }),
    null,
  );
});

test("recurring status-only drops preserve occurrence parent overrides and affect only selected occurrence", () => {
  const s = state([
    task("repeat", {
      recurrence: daily,
      schedule: { date: "2026-10-01", duration: 30 },
    }),
    child("child", "repeat"),
  ]);
  const source = get(s, "child", "repeat");
  const parentRef = ref("repeat", "repeat");
  s.exceptions[source.id] = {
    taskId: "child",
    context: source.context,
    parentRef,
    overrides: {},
  };
  const dest = d.dragDestination({
    sourceData: { kind: "section-task", taskId: source.id },
    data: { kind: "status-group", parentRef, completed: true },
    after: false,
    manual: true,
    sections: s.sections,
    projectId: "p",
    allTasks: expand(s),
    visible: expand(s),
    state: s,
  });
  assert.equal(dest.statusOnly, true);
  const next = d.reducer(
    s,
    d.taskDropAction(s, source, dest, expand(s), "2026-10-02"),
  );
  assert.deepEqual(next.exceptions[source.id].parentRef, parentRef);
  assert.equal(get(next, "child", "repeat").completed, true);
  assert.equal(get(next, "child", "repeat", "2026-10-03").completed, false);
  assert.equal(next.tasks.find((t) => t.id === "child")?.parentId, "repeat");
});

test("combined recurring drops complete the selected independent occurrence and retain template move scope", () => {
  const s = state([
    task("repeat", {
      recurrence: daily,
      schedule: { date: "2026-10-01", duration: 30 },
    }),
    task("target", {
      recurrence: daily,
      schedule: { date: "2026-10-01", duration: 30 },
    }),
  ]);
  const source = get(s, "repeat", "repeat", "2026-10-02");
  const dest = d.dragDestination({
    sourceData: { kind: "section-task", taskId: source.id },
    data: {
      kind: "status-group",
      parentRef: ref("target", "target", "2026-10-03"),
      completed: true,
    },
    after: false,
    manual: true,
    sections: s.sections,
    projectId: "p",
    allTasks: expand(s),
    visible: expand(s),
    state: s,
  });
  assert.ok(dest);
  const next = d.reducer(
    s,
    d.taskDropAction(s, source, dest, expand(s), "2026-10-02"),
  );
  assert.equal(next.tasks.find((t) => t.id === "repeat")?.parentId, "target");
  assert.equal(get(next, "repeat", "repeat", "2026-10-02").completed, true);
  assert.equal(get(next, "repeat", "repeat", "2026-10-03").completed, false);
});

test("reopening a child reopens ancestors without changing hierarchy", () => {
  const s = d.reducer(initial, {
    type: "complete",
    ref: ref("parent"),
    completed: true,
    today: "2026-10-02",
  });
  const next = commit(
    s,
    "grandchild",
    destination(s, "grandchild", "open", false)!,
  );
  assert.equal(get(next, "parent").completed, false);
  assert.equal(get(next, "open").completed, false);
  assert.equal(get(next, "grandchild").completed, false);
  assert.deepEqual(
    next.tasks.map((t) => [t.id, t.parentId]),
    s.tasks.map((t: { id: string; parentId: string | null }) => [
      t.id,
      t.parentId,
    ]),
  );
});

test("positional status changes preserve occurrence-specific parents and template parents", () => {
  const s = state([
    task("repeat", {
      recurrence: daily,
      schedule: { date: "2026-10-01", duration: 30 },
    }),
    child("branch", "repeat"),
    child("source", "repeat", { order: 0 }),
    child("target", "branch", { order: 1 }),
  ]);
  const source = get(s, "source", "repeat");
  const parentRef = ref("branch", "repeat");
  s.exceptions[source.id] = {
    taskId: "source",
    context: source.context,
    parentRef,
    overrides: {},
  };
  const target = get(s, "target", "repeat");
  s.exceptions[target.id] = {
    taskId: "target",
    context: target.context,
    overrides: { completed: true },
  };
  const dest = d.dragDestination({
    sourceData: { kind: "section-task", taskId: source.id },
    data: { kind: "section-task", taskId: target.id, completed: true },
    after: true,
    intent: "after",
    manual: true,
    sections: s.sections,
    projectId: "p",
    allTasks: expand(s),
    visible: expand(s),
    state: s,
  });
  assert.ok(dest);
  assert.equal(dest.statusOnly, undefined);
  const next = d.reducer(
    s,
    d.taskDropAction(
      s,
      get(s, "source", "repeat"),
      dest,
      expand(s),
      "2026-10-02",
    ),
  );
  assert.equal(get(next, "source", "repeat").completed, true);
  assert.equal(next.tasks.find((t) => t.id === "source")?.parentId, "repeat");
  assert.deepEqual(next.exceptions[source.id].parentRef, parentRef);
  assert.equal(
    d.occurrenceParent(next, get(next, "source", "repeat")).taskId,
    "branch",
  );
});
