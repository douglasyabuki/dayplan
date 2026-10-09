import { afterEach, describe, expect, test, vi } from "vitest";

import { tagIndex } from "@/lib/tags/hierarchy";
import { tagCounts } from "@/lib/tags/selectors";
import { matchesSearch, selectTasks } from "@/lib/workspace/selectors";
import {
  readWorkspace,
  STORAGE_KEY,
  writeWorkspace,
} from "@/stores/workspace/persistence";
import { reducer } from "@/stores/workspace/reducer";
import { deleteTag, moveTag, saveTag } from "@/stores/workspace/transitions";
import type { Tag } from "@/types-and-constants/tags";

import {
  asOccurrence,
  expandTasks,
  referenceKey,
} from "../../lib/tasks/recurrence";
import { state, task } from "../task-fixtures";

const tag = (id: string, parentId: string | null = null, order = 0): Tag => ({
  id,
  parentId,
  order,
  name: id,
  color: "sky",
});
const workspace = () => ({
  ...state(),
  tags: [
    tag("Work"),
    tag("Meetings", "Work"),
    tag("Weekly", "Meetings"),
    tag("Personal", null, 1),
    tag("Projects", "Work", 1),
  ],
});
afterEach(() => vi.unstubAllGlobals());

describe("atomic hierarchy operations", () => {
  test("creates roots and children, preserves IDs and appends siblings", () => {
    const before = workspace();
    const next = saveTag(before, tag("New", "Work", 999));
    expect(next.tags.at(-1)).toEqual(tag("New", "Work", 2));
    expect(before.tags).toHaveLength(5);
    expect(saveTag(next, tag("Root")).tags.at(-1)?.order).toBe(2);
  });
  test("moves an entire subtree, reorders, and promotes to root", () => {
    const before = workspace();
    const moved = moveTag(before, "Meetings", "Personal");
    expect(tagIndex(moved.tags).path("Weekly")).toBe(
      "Personal / Meetings / Weekly",
    );
    expect(moved.tasks).toBe(before.tasks);
    expect(moved.exceptions).toBe(before.exceptions);
    expect(tagIndex(moved.tags).byId.get("Projects")?.order).toBe(0);
    const root = moveTag(moved, "Meetings", null, "Work");
    expect(
      tagIndex(root.tags)
        .children.get(null)
        ?.map((t) => t.id),
    ).toEqual(["Meetings", "Work", "Personal"]);
    expect(reducer(root, { type: "replace", state: before })).toBe(before);
  });
  test("invalid and no-op moves never partially change their input", () => {
    const before = workspace(),
      snapshot = structuredClone(before);
    for (const parent of ["Weekly", "Work", "missing"])
      expect(() => moveTag(before, "Work", parent)).toThrow();
    expect(() => moveTag(before, "Work", null, "missing")).toThrow();
    expect(before).toEqual(snapshot);
    expect(moveTag(before, "Personal", null)).toBe(before);
    expect(saveTag(before, before.tags[0])).toBe(before);
    expect(deleteTag(before, "missing")).toBe(before);
  });
  test("rename keeps child links and updates cached paths", () => {
    const before = workspace(),
      index = tagIndex(before.tags);
    expect(index.path("Weekly")).toBe("Work / Meetings / Weekly");
    const next = saveTag(before, { ...before.tags[0], name: "Office" });
    expect(next.tags[2]).toBe(before.tags[2]);
    expect(tagIndex(next.tags).path("Weekly")).toBe(
      "Office / Meetings / Weekly",
    );
  });
  test("delete promotes children in place and removes assignments including overrides", () => {
    const before = workspace();
    before.tasks = [task("t", { tagIds: ["Work", "Meetings", "Weekly"] })];
    const ref = { taskId: "t" };
    before.exceptions = {
      [referenceKey(ref)]: {
        ...ref,
        overrides: { tagIds: ["Work", "Weekly"] },
      },
    };
    const snapshot = structuredClone(before);
    const next = reducer(before, {
      type: "deleteEntity",
      kind: "tags",
      id: "Work",
    });
    expect(
      tagIndex(next.tags)
        .children.get(null)
        ?.map((t) => t.id),
    ).toEqual(["Meetings", "Projects", "Personal"]);
    expect(tagIndex(next.tags).path("Weekly")).toBe("Meetings / Weekly");
    expect(next.tasks[0].tagIds).toEqual(["Meetings", "Weekly"]);
    expect(next.exceptions[referenceKey(ref)].overrides.tagIds).toEqual([
      "Weekly",
    ]);
    expect(before).toEqual(snapshot);
    expect(reducer(next, { type: "replace", state: before })).toEqual(snapshot);
    const nested = deleteTag(before, "Meetings");
    expect(
      tagIndex(nested.tags)
        .children.get("Work")
        ?.map((t) => t.id),
    ).toEqual(["Weekly", "Projects"]);
  });
  test("batch failure leaves all affected state intact", () => {
    const before = workspace(),
      snapshot = structuredClone(before);
    expect(() =>
      reducer(before, {
        type: "batch",
        actions: [
          { type: "moveTag", id: "Personal", parentId: "Work" },
          { type: "moveTag", id: "Work", parentId: "Personal" },
        ],
      }),
    ).toThrow();
    expect(before).toEqual(snapshot);
  });
});

describe("queries and caching", () => {
  test("filters descendants once and combines existing filters", () => {
    const s = workspace();
    s.tasks = [
      task("direct", { tagIds: ["Work"] }),
      task("nested", { tagIds: ["Work", "Meetings", "Weekly"] }),
      task("outside", { tagIds: ["Personal"] }),
      task("done", { tagIds: ["Weekly"], completed: true }),
    ];
    const tasks = s.tasks.map(asOccurrence);
    const select = (id: string | undefined, query = "") =>
      selectTasks(
        tasks,
        s,
        "tags",
        id,
        new URLSearchParams(query),
        "2026-10-08",
      ).map((t) => t.taskId);
    expect(select("Work")).toEqual(["direct", "nested"]);
    expect(select("Meetings")).toEqual(["nested"]);
    expect(select(undefined, "tag=Work")).toEqual(["direct", "nested"]);
    expect(select("Work", "tag=Weekly&status=completed")).toEqual(["done"]);
    expect(select("Work", "project=missing")).toEqual([]);
    expect(select("Work", "q=Weekly")).toEqual(["nested"]);
    expect(tagCounts(tasks, tagIndex(s.tags)).get("Work")).toBe(2);
    expect(tagCounts(tasks, tagIndex(s.tags)).get("Meetings")).toBe(1);
  });
  test("ancestor search and distinct recurring occurrences remain consistent", () => {
    const s = workspace();
    s.tasks = [
      task("repeat", {
        tagIds: ["Weekly", "Work"],
        schedule: { date: "2026-10-01", duration: 30 },
        recurrence: { frequency: "daily", weekdays: [], until: "2026-10-03" },
      }),
    ];
    const occurrences = expandTasks(s, "2026-10-01", "2026-10-03");
    expect(occurrences).toHaveLength(3);
    expect(matchesSearch(occurrences[0], s, "Work / Meetings")).toBe(true);
    expect(tagCounts(occurrences, tagIndex(s.tags)).get("Work")).toBe(3);
    expect(
      selectTasks(
        occurrences,
        s,
        "tags",
        "Work",
        new URLSearchParams(),
        "2026-10-01",
      ),
    ).toHaveLength(3);
  });
  test("indexes and occurrences survive unrelated edits and invalidate relevant edits", () => {
    const s = workspace();
    s.tasks = [task("t", { tagIds: ["Weekly"] })];
    const index = tagIndex(s.tags),
      occurrences = expandTasks(s, "2026-10-01", "2026-10-03");
    const themed = reducer(s, { type: "theme", theme: "dark" });
    expect(tagIndex(themed.tags)).toBe(index);
    expect(expandTasks(themed, "2026-10-01", "2026-10-03")).toBe(occurrences);
    const moved = moveTag(s, "Meetings", "Personal");
    expect(tagIndex(moved.tags)).not.toBe(index);
    expect(matchesSearch(occurrences[0], moved, "Personal")).toBe(true);
    expect(matchesSearch(occurrences[0], moved, "Work")).toBe(false);
  });
  test("validates deep hierarchies iteratively and checks ranges without walking descendants", () => {
    const tags = Array.from({ length: 12000 }, (_, i) =>
      tag(String(i), i ? String(i - 1) : null),
    );
    const index = tagIndex(tags);
    expect(index.rows.at(-1)?.depth).toBe(11999);
    expect(index.contains("0", "11999")).toBe(true);
    expect(index.contains("11999", "0")).toBe(false);
    expect(() => tagIndex([tag("a", "b"), tag("b", "a")])).toThrow();
    expect(() => tagIndex([tag("a"), tag("a")])).toThrow();
  });
});

describe("migration and persistence", () => {
  function storage(raw: string) {
    const data = new Map([[STORAGE_KEY, raw]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    });
    return data;
  }
  test("legacy tags become roots without changing tasks, then round-trip", () => {
    const s = workspace();
    s.tasks = [task("t", { tagIds: ["Weekly"] })];
    const legacy = {
      ...s,
      tags: s.tags.map(({ id, name, color }) => ({ id, name, color })),
    };
    const raw = JSON.stringify(legacy),
      saved = storage(raw);
    const restored = readWorkspace()!;
    expect(restored.tags.map((t) => t.parentId)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(restored.tags.map((t) => t.order)).toEqual([0, 1, 2, 3, 4]);
    expect(restored.tasks).toEqual(s.tasks);
    expect(saved.get(STORAGE_KEY)).toBe(raw);
    const moved = moveTag(restored, "Weekly", "Work");
    writeWorkspace(moved);
    expect(readWorkspace()).toEqual(moved);
  });
  test("invalid hierarchy never overwrites saved data", () => {
    const s = workspace();
    s.tags[0].parentId = "Weekly";
    const raw = JSON.stringify(s),
      saved = storage(raw);
    expect(() => readWorkspace()).toThrow();
    expect(saved.get(STORAGE_KEY)).toBe(raw);
  });
  test("storage failure leaves the immutable committed snapshot available", () => {
    const next = moveTag(workspace(), "Meetings", null);
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("Quota exceeded");
      },
    });
    expect(() => writeWorkspace(next)).toThrow("Quota exceeded");
    expect(tagIndex(next.tags).path("Weekly")).toBe("Meetings / Weekly");
  });
});
