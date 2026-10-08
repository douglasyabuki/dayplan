import assert from "node:assert/strict";

import { test } from "vitest";

import { child, domain as d, get, ref, state, task } from "../task-fixtures";

test("pointer nesting is limited to the title center, excluding controls and trailing whitespace", () => {
  const title = { left: 40, top: 100, width: 500, height: 20 };
  assert.equal(d.taskPointerIntent({ x: 80, y: 110 }, title), "inside");
  assert.equal(d.taskPointerIntent({ x: 80, y: 106 }, title), "before");
  assert.equal(d.taskPointerIntent({ x: 80, y: 114 }, title), "after");
  assert.equal(d.taskPointerIntent({ x: 20, y: 110 }, title), "after");
  assert.equal(d.taskPointerIntent({ x: 300, y: 110 }, title), "after");
  assert.equal(
    d.taskPointerIntent({ x: 80, y: 120 }, { ...title, height: 60 }),
    "before",
  );
  assert.equal(
    d.taskPointerIntent({ x: 110, y: 110 }, { ...title, width: 60 }),
    "after",
  );
});

const s = state([
  task("a", { order: 0 }),
  task("b", { order: 1 }),
  child("c", "b"),
  task("d", { order: 2 }),
]);
const all = d.expandTasks(s, "2026-10-01", "2026-10-02");
const resolve = (extra = {}) =>
  d.dragDestination({
    sourceData: { kind: "section-task", taskId: get(s, "a").id },
    data: { kind: "section-task", taskId: get(s, "b").id, sectionId: "a" },
    after: false,
    intent: "inside",
    manual: true,
    sections: s.sections,
    projectId: "p",
    allTasks: all,
    visible: all,
    state: s,
    ...extra,
  });
test("live sibling previews match the committed order and cancel without mutation", () => {
  for (const intent of ["before", "after"]) {
    const source = intent === "before" ? "d" : "a";
    const destination = resolve({
      sourceData: { kind: "section-task", taskId: get(s, source).id },
      intent,
    });
    const roots = all.filter((t) => !t.parentId);
    const original = structuredClone(roots);
    assert.deepEqual(
      d.previewOrder(roots, destination).map((t) => t.id),
      destination.ids,
    );
    assert.deepEqual(d.previewOrder(roots, null), original);
    assert.deepEqual(roots, original);
  }
});
test("section previews preserve objects and use the proposed order", () => {
  const sections = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const destination = {
    kind: "section",
    ...d.insertion(["a", "b", "c"], "a", "b", true),
  };
  assert.deepEqual(d.previewOrder(sections, destination), [
    sections[1],
    sections[0],
    sections[2],
  ]);
  assert.equal(d.previewOrder(sections, destination)[1], sections[0]);
});
test("nested sibling previews keep grandchildren attached and do not reparent sources", () => {
  const initial = state([
    task("a"),
    child("b", "a", { order: 0 }),
    child("c", "a", { order: 1 }),
    child("grandchild", "b"),
  ]);
  const expanded = d.expandTasks(initial, "2026-10-01", "2026-10-02");
  const children = d.occurrenceChildren(initial, get(initial, "a"), expanded);
  const destination = d.dragDestination({
    sourceData: { taskId: get(initial, "b").id },
    data: { taskId: get(initial, "c").id },
    after: true,
    intent: "after",
    manual: true,
    sections: initial.sections,
    projectId: "p",
    allTasks: expanded,
    visible: expanded,
    state: initial,
  });
  assert.deepEqual(
    d.previewOrder(children, destination).map((t) => t.taskId),
    ["c", "b"],
  );
  assert.deepEqual(
    d
      .occurrenceChildren(initial, get(initial, "b"), expanded)
      .map((t) => t.taskId),
    ["grandchild"],
  );
  assert.equal(
    d.previewOrder(children, { ...destination, intent: "inside" }),
    children,
  );
  const filtered = children.slice(0, 1);
  assert.equal(d.previewOrder(filtered, destination), filtered);
});
test("inside populated parent advertises and commits a child destination", () => {
  const dest = resolve();
  assert.equal(dest.intent, "inside");
  assert.deepEqual(dest.parentRef, ref("b"));
  const moved = d.reducer(s, { type: "moveTask", task: get(s, "a"), ...dest });
  assert.equal(moved.tasks.find((t) => t.id === "a")!.parentId, "b");
  assert.equal(get(moved, "a").sectionId, "a");
  assert.deepEqual(
    d
      .occurrenceChildren(
        moved,
        get(moved, "b"),
        d.expandTasks(moved, "2026-10-01", "2026-10-02"),
      )
      .map((t) => t.taskId),
    ["c", "a"],
  );
});
test("before and after commit the advertised root ordering", () => {
  for (const intent of ["before", "after"]) {
    const source = intent === "before" ? "d" : "a";
    const dest = resolve({
      sourceData: { kind: "section-task", taskId: get(s, source).id },
      intent,
    });
    const moved = d.reducer(s, {
      type: "moveTask",
      task: get(s, source),
      parentRef: dest.parentRef,
      projectId: dest.projectId,
      sectionId: dest.sectionId,
      beforeId: dest.beforeId,
    });
    assert.deepEqual(
      d
        .expandTasks(moved, "2026-10-01", "2026-10-02")
        .filter((t) => !t.parentId)
        .sort((a, b) => a.order - b.order)
        .map((t) => t.id),
      dest.ids,
    );
  }
});
test("automatic sort and incomplete sibling contexts reject positional drops", () => {
  assert.equal(resolve({ manual: false, intent: "before" }), null);
  assert.equal(
    resolve({ intent: "after", visible: all.filter((t) => t.taskId !== "d") }),
    null,
  );
  assert.ok(resolve({ manual: false, intent: "inside" }));
});
test("self, descendant, outside and canceled drops are invalid", () => {
  assert.equal(resolve({ data: null }), null);
  assert.equal(resolve({ canceled: true }), null);
  assert.equal(resolve({ data: { taskId: get(s, "a").id } }), null);
  assert.equal(
    resolve({
      sourceData: { taskId: get(s, "b").id },
      data: { taskId: get(s, "c").id },
    }),
    null,
  );
});
test("detach adopts section or Unsectioned and preserves descendants", () => {
  const initial = state([task("a"), child("b", "a"), child("c", "b")]);
  for (const sectionId of ["b", null]) {
    const moved = d.reducer(initial, {
      type: "moveTask",
      task: get(initial, "b"),
      parentRef: null,
      projectId: "p",
      sectionId,
    });
    assert.equal(moved.tasks.find((t) => t.id === "b")!.parentId, null);
    assert.equal(get(moved, "c").sectionId, sectionId);
    assert.equal(moved.tasks.find((t) => t.id === "c")!.parentId, "b");
  }
});
test("manual child reordering does not detach or change unrelated sibling ranks", () => {
  const initial = state([
    task("a"),
    child("b", "a", { order: 0 }),
    child("c", "a", { order: 1 }),
    task("other", { order: 8 }),
  ]);
  const reordered = d.reducer(initial, {
    type: "reorderTasks",
    tasks: d.expandTasks(initial, "2026-10-01", "2026-10-02"),
    ids: [get(initial, "c").id, get(initial, "b").id],
  });
  assert.equal(get(reordered, "c").order, 0);
  assert.equal(get(reordered, "b").parentId, "a");
  assert.equal(get(reordered, "other").order, 8);
});

test("subtask-list drop appends without changing state during resolution", () => {
  const before = structuredClone(s);
  const dest = resolve({
    data: { kind: "task-children", taskId: get(s, "b").id, sectionId: "a" },
    intent: "inside",
  });
  assert.deepEqual(dest.parentRef, ref("b"));
  assert.deepEqual(s, before);
  const saved = d.reducer(s, {
    type: "moveTask",
    task: get(s, "a"),
    parentRef: dest.parentRef,
    sectionId: dest.sectionId,
    tasks: all,
    beforeId: dest.beforeId,
  });
  const members = d.occurrenceChildren(
    saved,
    get(saved, "b"),
    d.expandTasks(saved, "2026-10-01", "2026-10-02"),
  );
  assert.deepEqual(
    members.map((t) => t.id),
    dest.ids,
  );
});

test("moving an inherited child before a sibling retains its occurrence context", () => {
  const initial = state([
    task("a", {
      recurrence: { frequency: "daily", weekdays: [] },
      schedule: { date: "2026-10-01", duration: 30 },
    }),
    child("b", "a", { order: 0 }),
    child("c", "a", { order: 1 }),
  ]);
  const source = get(initial, "c", "a"),
    target = get(initial, "b", "a");
  const next = d.reducer(initial, {
    type: "moveTask",
    task: source,
    parentRef: ref("a", "a"),
    sectionId: "a",
    beforeId: target.id,
  });
  assert.equal(next.tasks.length, 3);
  assert.equal(get(next, "c", "a").order, 0);
  assert.equal(get(next, "c", "a", "2026-10-03").order, 1);
  assert.deepEqual(
    d.occurrenceParent(next, get(next, "c", "a")),
    ref("a", "a"),
  );
});
