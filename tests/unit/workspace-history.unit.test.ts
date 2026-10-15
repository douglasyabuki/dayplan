import { expect, test } from "vitest";

import {
  taskDropAction,
  taskOperationAction,
} from "@/stores/workspace/commands";
import { WorkspaceHistory } from "@/stores/workspace/history";
import { reducer } from "@/stores/workspace/reducer";
import { child, daily, get, state, task } from "@/tests/task-fixtures";

test("retains twenty complete actions and moves the cursor in both directions", () => {
  const history = new WorkspaceHistory();
  let current = state([task("a", { title: "0" })]);
  for (let n = 1; n <= 21; n++) {
    const next = {
      ...current,
      tasks: [{ ...current.tasks[0], title: String(n) }],
    };
    history.record(current, next);
    current = next;
  }
  for (let n = 20; n >= 1; n--) {
    current = history.undo(current)!;
    expect(current.tasks[0].title).toBe(String(n));
  }
  expect(history.undo(current)).toBeNull();
  for (let n = 2; n <= 21; n++) {
    current = history.redo(current)!;
    expect(current.tasks[0].title).toBe(String(n));
  }
  expect(history.redo(current)).toBeNull();
});

test("appearance and semantic no-ops preserve redo; new content truncates it", () => {
  const history = new WorkspaceHistory();
  const original = state([task("a")]);
  const edited = { ...original, tasks: [task("a", { title: "Edited" })] };
  history.record(original, edited);
  const restored = history.undo(edited)!;
  const appearance = {
    ...restored,
    theme: "dark" as const,
    layouts: { inbox: "board" as const },
    timezone: "Pacific/Auckland",
  };
  expect(history.record(restored, appearance)).toBeUndefined();
  expect(
    history.record(appearance, structuredClone(appearance)),
  ).toBeUndefined();
  expect(history.canRedo).toBe(true);
  const redone = history.redo(appearance)!;
  expect(redone).toEqual({ ...appearance, tasks: edited.tasks });
  const undone = history.undo(redone)!;
  const branch = {
    ...undone,
    tags: [{ id: "tag", name: "Tag", color: "sky", parentId: null, order: 0 }],
  };
  history.record(undone, branch);
  expect(history.canRedo).toBe(false);
  expect(history.undo(branch)).toEqual(undone);
});

test("a batch restores relationships atomically and clear invalidates its generation", () => {
  const history = new WorkspaceHistory();
  const original = state([task("a"), child("child", "a")]);
  const after = reducer(original, {
    type: "batch",
    actions: [
      { type: "deleteEntity", kind: "projects", id: "p" },
      {
        type: "entity",
        kind: "tags",
        entity: {
          id: "tag",
          name: "Tag",
          color: "sky",
          parentId: null,
          order: 0,
        },
      },
    ],
  });
  const id = history.record(original, after);
  expect(id).toBe(history.undoId);
  expect(history.undo(after)).toEqual(original);
  expect(history.canUndo).toBe(false);
  expect(history.redo(original)).toEqual(after);
  history.clear();
  expect(history.generation).toBe(1);
  expect(history.canUndo).toBe(false);
  expect(history.canRedo).toBe(false);
});

test("a drop moving a subtree is one reversible operation", () => {
  const history = new WorkspaceHistory();
  const original = state([task("a"), child("child", "a")]);
  const after = reducer(
    original,
    taskDropAction(
      original,
      get(original, "a"),
      {
        kind: "section",
        projectId: null,
        sectionId: null,
        ids: [],
      },
      original.tasks.map((t) => get(original, t.id)),
      "2026-10-14",
    ),
  );
  expect(after.tasks[0].projectId).toBeNull();
  history.record(original, after);
  expect(history.undo(after)).toEqual(original);
  expect(history.canUndo).toBe(false);
  expect(history.redo(original)).toEqual(after);
});

test("undo/redo restores a recurring occurrence and its subtree exceptions together", () => {
  const history = new WorkspaceHistory();
  const original = state([
    task("a", {
      recurrence: daily,
      schedule: { date: "2026-10-01", duration: 30 },
    }),
    child("child", "a"),
  ]);
  const after = reducer(
    original,
    taskOperationAction(original, {
      kind: "delete",
      task: get(original, "a", "a", "2026-10-03"),
      scope: "occurrence",
    }),
  );
  expect(Object.keys(after.exceptions).length).toBeGreaterThan(0);
  expect(get(after, "a", "a", "2026-10-04").title).toBe("a");
  history.record(original, after);
  expect(history.undo(after)).toEqual(original);
  expect(history.canUndo).toBe(false);
  expect(history.redo(original)).toEqual(after);
});
