import assert from "node:assert/strict";

import { test } from "vitest";

import { child, domain as d, get, ref, state, task } from "./task-fixtures.ts";

const initial = state([
  ...[null, "a", "b"].flatMap((sectionId) => {
    const prefix = sectionId ?? "unsectioned";
    return [
      task(`${prefix}-first`, { sectionId, order: 0 }),
      task(`${prefix}-source`, { sectionId, order: 1 }),
      child(`${prefix}-leaf`, `${prefix}-source`),
      task(`${prefix}-last`, { sectionId, order: 2 }),
    ];
  }),
  task("parent", { sectionId: "a", order: 3 }),
  child("child-first", "parent", { order: 0 }),
  child("child-source", "parent", { order: 1 }),
  child("child-leaf", "child-source"),
  child("child-last", "parent", { order: 2 }),
  child("deep-first", "child-last", { order: 0 }),
  child("deep-source", "child-last", { order: 1 }),
  child("deep-leaf", "deep-source"),
  child("deep-last", "child-last", { order: 2 }),
]);
const expand = (s) => d.expandTasks(s, "2026-10-01", "2026-10-02");
const all = expand(initial);
const destination = (source, data, options = {}, workspace = initial) =>
  d.dragDestination({
    sourceData: { kind: "section-task", taskId: get(workspace, source).id },
    data,
    after: false,
    manual: true,
    sections: workspace.sections,
    projectId: "p",
    allTasks: expand(workspace),
    visible: expand(workspace),
    state: workspace,
    ...options,
  });
const card = (id) => ({ kind: "section-task", taskId: get(initial, id).id });
const section = (sectionId) => ({ kind: "section-target", sectionId });
const commit = (source, dest) =>
  dest
    ? d.reducer(initial, {
        type: "moveTask",
        task: get(initial, source),
        tasks: all,
        ...dest,
      })
    : initial;
const sources = [
  "unsectioned-source",
  "a-source",
  "b-source",
  "child-source",
  "deep-source",
];

for (const source of sources) {
  test(`${source}: positional moves, nesting and detaching agree with the advertised destination`, () => {
    const before = structuredClone(initial);
    for (const target of [
      "unsectioned-first",
      "a-first",
      "b-first",
      "child-first",
      "deep-first",
    ]) {
      for (const intent of ["before", "after", "inside"]) {
        const dest = destination(source, card(target), { intent });
        // The source immediately follows *-first in its original list.
        if (!dest) {
          assert.equal(intent, "after");
          assert.equal(source.replace("source", "first"), target);
          continue;
        }
        const moved = commit(source, dest);
        const result = get(moved, source);
        assert.deepEqual(d.occurrenceParent(moved, result), dest.parentRef);
        assert.equal(result.sectionId, dest.sectionId);
        assert.equal(result.projectId, dest.projectId);
        const siblings = expand(moved)
          .filter((t) => {
            const parent = d.occurrenceParent(moved, t);
            return dest.parentRef
              ? parent &&
                  d.referenceKey(parent) === d.referenceKey(dest.parentRef)
              : !parent &&
                  !t.parentId &&
                  t.sectionId === dest.sectionId &&
                  t.projectId === dest.projectId;
          })
          .sort((a, b) => a.order - b.order);
        assert.deepEqual(
          siblings.map((t) => t.id),
          dest.ids,
        );
        const leaf = get(moved, source.replace("source", "leaf"));
        assert.equal(leaf.parentId, source);
        assert.equal(leaf.sectionId, dest.sectionId);
      }
    }
    for (const sectionId of [null, "a", "b"]) {
      const dest = destination(source, section(sectionId));
      assert.ok(dest);
      const result = get(commit(source, dest), source);
      assert.equal(result.parentId, null);
      assert.equal(result.sectionId, sectionId);
    }
    assert.deepEqual(initial, before);
  });

  test(`${source}: returning to the source abandons cross-list and nesting hovers`, () => {
    for (const target of [
      section(null),
      section("a"),
      section("b"),
      card("deep-first"),
    ]) {
      const previous = destination(source, target, { intent: "inside" });
      const result = destination(source, card(source), { previous });
      const original = get(initial, source);
      const originalParent = d.occurrenceParent(initial, original);
      const sameList =
        previous &&
        previous.intent !== "inside" &&
        !originalParent &&
        previous.sectionId === original.sectionId;
      assert.equal(result, sameList ? previous : null);
      if (!sameList) assert.equal(commit(source, result), initial);
      assert.equal(destination(source, null, { previous }), null);
      assert.equal(
        destination(source, target, { previous, canceled: true }),
        null,
      );
    }
  });

  test(`${source}: sibling previews survive hovering the moved source`, () => {
    const previous = destination(
      source,
      card(source.replace("source", "first")),
      { intent: "before" },
    );
    assert.ok(previous);
    assert.equal(destination(source, card(source), { previous }), previous);
  });
}

test("cross-section positions replace each other, and an original no-op clears the hover", () => {
  const source = "a-source";
  let previous = destination(source, section("b"));
  for (const [target, intent] of [
    ["b-first", "before"],
    ["b-last", "after"],
    ["unsectioned-first", "after"],
    ["a-last", "after"],
  ]) {
    previous = destination(source, card(target), { intent, previous });
    assert.equal(previous.targetId, get(initial, target).id);
    assert.equal(previous.intent, intent);
    assert.equal(
      get(commit(source, previous), source).sectionId,
      get(initial, target).sectionId,
    );
  }
  previous = destination(source, card("a-first"), {
    intent: "after",
    previous,
  });
  assert.equal(previous, null);
  assert.equal(commit(source, previous), initial);
});

test("empty sections accept roots and detached subtasks; returning to an only-child source cancels", () => {
  const workspace = state([task("root"), child("nested", "root")]);
  for (const source of ["root", "nested"]) {
    const previous = destination(source, section("b"), {}, workspace);
    assert.deepEqual(previous.ids, [get(workspace, source).id]);
    assert.equal(
      destination(
        source,
        { kind: "section-task", taskId: get(workspace, source).id },
        { previous },
        workspace,
      ),
      null,
    );
  }
});

test("dropping into the children area always appends as a child", () => {
  const dest = destination(
    "b-source",
    { kind: "task-children", taskId: get(initial, "child-last").id },
    { intent: "after" },
  );
  assert.equal(dest.intent, "inside");
  assert.deepEqual(dest.parentRef, ref("child-last"));
  assert.equal(
    get(commit("b-source", dest), "b-source").parentId,
    "child-last",
  );
});

test("explicit Inbox destinations clear the project and section", () => {
  for (const source of sources) {
    const dest = destination(source, { kind: "project", projectId: null });
    assert.equal(dest.projectId, null);
    const moved = commit(source, dest);
    assert.equal(get(moved, source).projectId, null);
    assert.equal(get(moved, source).sectionId, null);
    assert.equal(get(moved, source.replace("source", "leaf")).projectId, null);
  }
});

test("invalid targets clear previous destinations instead of committing stale hovers", () => {
  const source = "a-source";
  const previous = destination(source, section("b"));
  for (const data of [null, section("missing"), card("a-leaf")]) {
    assert.equal(
      destination(source, data, { previous, intent: "inside" }),
      null,
    );
  }
  assert.equal(
    destination(source, card("b-first"), {
      previous,
      intent: "before",
      manual: false,
    }),
    null,
  );
  assert.equal(
    destination(source, card("b-first"), {
      previous,
      intent: "before",
      visible: all.filter((t) => t.taskId !== "b-last"),
    }),
    null,
  );
});

test("occurrence placements cannot create cycles absent from the template hierarchy", () => {
  let workspace = state([
    task("recurring", {
      recurrence: { frequency: "daily", weekdays: [] },
      schedule: { date: "2026-10-01", duration: 30 },
    }),
    task("placed"),
  ]);
  const parent = get(workspace, "recurring", "recurring");
  workspace = d.reducer(workspace, {
    type: "moveTask",
    task: get(workspace, "placed"),
    parentRef: d.reference(parent),
    tasks: expand(workspace),
  });
  const resolved = d.dragDestination({
    sourceData: { taskId: parent.id },
    data: { taskId: get(workspace, "placed").id },
    intent: "inside",
    after: false,
    manual: true,
    sections: workspace.sections,
    projectId: "p",
    allTasks: expand(workspace),
    visible: expand(workspace),
    state: workspace,
  });
  assert.equal(resolved, null);
});

test("recurring subtasks keep only previews for their own parent occurrence", () => {
  const workspace = state([
    task("daily", {
      recurrence: { frequency: "daily", weekdays: [] },
      schedule: { date: "2026-10-01", duration: 30 },
    }),
    child("first", "daily", { order: 0 }),
    child("source", "daily", { order: 1 }),
  ]);
  const source = get(workspace, "source", "daily");
  const resolve = (data, previous = null, intent = "before") =>
    d.dragDestination({
      sourceData: { taskId: source.id },
      data,
      previous,
      intent,
      after: false,
      manual: true,
      sections: workspace.sections,
      projectId: "p",
      allTasks: expand(workspace),
      visible: expand(workspace),
      state: workspace,
    });
  const ownSibling = resolve({ taskId: get(workspace, "first", "daily").id });
  assert.equal(resolve({ taskId: source.id }, ownSibling), ownSibling);
  const otherDate = resolve(
    { taskId: get(workspace, "daily", "daily", "2026-10-01").id },
    null,
    "inside",
  );
  assert.ok(otherDate);
  assert.equal(resolve({ taskId: source.id }, otherDate), null);
});

test("a child placed under an unsectioned recurring parent can be detached", () => {
  let workspace = state([
    task("daily", {
      sectionId: null,
      recurrence: { frequency: "daily", weekdays: [] },
      schedule: { date: "2026-10-01", duration: 30 },
    }),
    task("placed", { sectionId: null }),
  ]);
  workspace = d.reducer(workspace, {
    type: "moveTask",
    task: get(workspace, "placed"),
    parentRef: ref("daily", "daily"),
    tasks: expand(workspace),
  });
  const source = get(workspace, "placed");
  assert.equal(source.parentId, null);
  assert.ok(d.occurrenceParent(workspace, source));
  const dest = destination(
    "placed",
    { kind: "section-remove", sectionId: null },
    {},
    workspace,
  );
  assert.ok(dest);
  const moved = d.reducer(workspace, {
    type: "moveTask",
    task: source,
    tasks: expand(workspace),
    ...dest,
  });
  assert.equal(d.occurrenceParent(moved, get(moved, "placed")), null);
  assert.equal(get(moved, "placed").sectionId, null);
});

test("section reordering retains only its own preview and cancels cleanly", () => {
  const resolve = (data, previous = null, canceled = false) =>
    d.dragDestination({
      sourceData: { kind: "section", sectionId: "a" },
      data,
      previous,
      canceled,
      after: true,
      manual: true,
      sections: initial.sections,
      projectId: "p",
      allTasks: all,
      visible: all,
      state: initial,
    });
  const previous = resolve({ kind: "section", sectionId: "b" });
  assert.deepEqual(previous.ids, ["b", "a"]);
  assert.equal(
    resolve({ kind: "section", sectionId: "a" }, previous),
    previous,
  );
  assert.equal(resolve(null, previous), null);
  assert.equal(
    resolve({ kind: "section", sectionId: "a" }, previous, true),
    null,
  );
});
