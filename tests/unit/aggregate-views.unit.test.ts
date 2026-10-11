import { describe, expect, it } from "vitest";

import { addDays, dateKey } from "@/lib/dates";
import {
  asOccurrence,
  expandTasks,
  resolveOccurrence,
} from "@/lib/tasks/recurrence";
import {
  groupDestination,
  groupDraft,
  groupDropAction,
} from "@/lib/workspace/group-drag";
import {
  aggregateGroupings,
  creationDefaults,
  emptyGroupTargets,
  type GroupKind,
  groupTasks,
  makeGroup,
  resolveGrouping,
  upcomingRange,
} from "@/lib/workspace/grouping";
import { selectTasks } from "@/lib/workspace/selectors";
import { reducer } from "@/stores/workspace/reducer";

import { child, daily, state, task } from "../task-fixtures";

const today = "2026-10-10";
const params = (value = "") => new URLSearchParams(value);

describe("aggregate grouping and ranges", () => {
  it("resolves only groupings supported by each view", () => {
    expect(resolveGrouping("today", params("group=deadline"))).toBe("today");
    expect(resolveGrouping("upcoming", params("group=status"))).toBe(
      "upcoming",
    );
    expect(resolveGrouping("tasks", params("group=sections"))).toBe("none");
    for (const [view, kinds] of Object.entries(aggregateGroupings))
      for (const kind of kinds)
        expect(resolveGrouping(view, params(`group=${kind}`))).toBe(kind);
  });
  it("keeps projects with identical labels distinct", () => {
    const workspace = state([task("a"), task("b", { projectId: "q" })]);
    workspace.projects.push({ id: "q", name: "Project", color: "sky" });
    const groups = groupTasks(
      workspace.tasks.map(asOccurrence),
      workspace,
      "tasks",
      params("group=project"),
      today,
    );
    expect(groups.map((g) => g.label)).toEqual(["Project", "Project"]);
    expect(new Set(groups.map((g) => g.id)).size).toBe(2);
  });
  it("groups resolved subtasks by their own properties and inherited project", () => {
    const workspace = state([
      task("parent", { priority: "low" }),
      child("child", "parent", { priority: "high" }),
    ]);
    const tasks = expandTasks(workspace, today, today);
    const priority = groupTasks(
      tasks,
      workspace,
      "tasks",
      params("group=priority"),
      today,
    );
    expect(
      priority.find((g) => g.value === "high")?.tasks.map((t) => t.taskId),
    ).toEqual(["child"]);
    expect(
      groupTasks(tasks, workspace, "tasks", params("group=project"), today)[0]
        .tasks,
    ).toHaveLength(2);
  });
  it("deduplicates same-date appearances and labels both roles", () => {
    const t = asOccurrence(
      task("both", {
        schedule: { date: today, duration: 30 },
        deadline: { date: today },
      }),
    );
    let groups = groupTasks([t], state(), "upcoming", params(), today);
    expect(groups).toHaveLength(1);
    expect(groups[0].appearances[0].roles).toEqual(["Scheduled", "Due"]);
    t.deadline = { date: addDays(today, 2) };
    groups = groupTasks([t], state(), "upcoming", params(), today);
    expect(groups.map((g) => g.appearances[0].roles)).toEqual([
      ["Scheduled"],
      ["Due"],
    ]);
    expect(groups[0].appearances[0].id).not.toBe(groups[1].appearances[0].id);
  });
  it.each([
    [null, 30],
    ["0", 30],
    ["-7", 30],
    ["NaN", 30],
    ["Infinity", 30],
    ["7", 7],
    ["8", 30],
    ["30", 30],
    ["60", 365],
    ["999", 365],
  ] as const)("normalizes range %s to %s", (raw, days) => {
    expect(upcomingRange(today, raw).days).toBe(days);
  });
  it("uses inclusive calendar intervals across year, leap-day, and DST boundaries", () => {
    expect(upcomingRange("2026-12-30", "7").end).toBe("2027-01-05");
    expect(upcomingRange("2028-02-27", "7").end).toBe("2028-03-04");
    expect(upcomingRange("2026-03-07", "7").end).toBe("2026-03-13");
    expect(dateKey(new Date("2026-10-10T01:00:00Z"), "America/Sao_Paulo")).toBe(
      "2026-10-09",
    );
  });
  it("uses the same exact endpoint for selection and grouping", () => {
    const tasks = [0, 6, 7].map((offset) =>
      asOccurrence(
        task(String(offset), {
          schedule: { date: addDays(today, offset), duration: 30 },
        }),
      ),
    );
    const selected = selectTasks(
      tasks,
      state(),
      "upcoming",
      undefined,
      params("range=7"),
      today,
    );
    expect(selected.map((t) => t.taskId)).toEqual(["0", "6"]);
    expect(
      groupTasks(tasks, state(), "upcoming", params("range=7"), today).flatMap(
        (g) => g.tasks.map((t) => t.taskId),
      ),
    ).toEqual(["0", "6"]);
  });
  it("only reveals filter-compatible empty targets", () => {
    expect(
      emptyGroupTargets(
        "priority",
        state(),
        params("priority=high"),
        today,
      ).map((g) => g.value),
    ).toEqual(["high"]);
    expect(
      emptyGroupTargets("status", state(), params(), today).map((g) => g.value),
    ).toEqual(["open"]);
    expect(
      emptyGroupTargets("status", state(), params("status=all"), today),
    ).toHaveLength(2);
    expect(
      emptyGroupTargets("schedule", state(), params("scheduled=yes"), today),
    ).toEqual([]);
    expect(
      emptyGroupTargets("deadline", state(), params("from=2026-10-10"), today),
    ).toEqual([]);
  });
});

describe("creation defaults", () => {
  it.each(["today", "upcoming"])(
    "schedules %s header creation today",
    (view) => {
      expect(creationDefaults(view, params(), today).schedule).toEqual({
        date: today,
        duration: 30,
      });
    },
  );
  it("leaves All tasks undated and applies independent filters", () => {
    expect(creationDefaults("tasks", params(), today).schedule).toBeUndefined();
    expect(
      creationDefaults(
        "tasks",
        params("project=p&priority=high&tag=t&status=completed"),
        today,
      ),
    ).toMatchObject({
      projectId: "p",
      sectionId: null,
      priority: "high",
      tagIds: ["t"],
      completed: false,
    });
  });
  it("uses deadline today for an Unscheduled view and only infers exact due bounds", () => {
    expect(
      creationDefaults("today", params("scheduled=no"), today),
    ).toMatchObject({ schedule: undefined, deadline: { date: today } });
    expect(
      creationDefaults("tasks", params(`from=${today}&to=${today}`), today)
        .deadline,
    ).toEqual({ date: today });
    expect(
      creationDefaults("tasks", params(`from=${today}`), today).deadline,
    ).toBeUndefined();
    expect(
      creationDefaults("tasks", params("scheduled=yes"), today).schedule?.date,
    ).toBe(today);
  });
  it.each(["schedule", "upcoming", "deadline"] as GroupKind[])(
    "uses clicked %s date",
    (kind) => {
      const result = creationDefaults("upcoming", params(), today, {
        group: { kind, value: "2026-10-15" },
      });
      expect(
        (kind === "deadline" ? result.deadline : result.schedule)?.date,
      ).toBe("2026-10-15");
    },
  );
  it("gives clicked properties precedence, leaving other compatible defaults", () => {
    expect(
      creationDefaults("today", params("project=p&priority=low"), today, {
        group: { kind: "priority", value: "high" },
      }),
    ).toMatchObject({
      projectId: "p",
      priority: "high",
      schedule: { date: today },
    });
    expect(
      creationDefaults("tasks", params("project=p"), today, {
        group: { kind: "project", value: null },
      }),
    ).toMatchObject({ projectId: null, sectionId: null });
    expect(
      creationDefaults("upcoming", params(), today, {
        group: { kind: "schedule", value: null },
      }),
    ).toMatchObject({ schedule: undefined, deadline: { date: today } });
    expect(
      creationDefaults("upcoming", params(), today, {
        group: { kind: "deadline", value: null },
      }),
    ).toMatchObject({ deadline: undefined, schedule: { date: today } });
  });
  it("hides creation in Overdue, Completed, and past-date groups", () => {
    for (const [kind, value] of [
      ["today", "overdue"],
      ["status", "completed"],
      ["deadline", "2026-10-09"],
      ["schedule", "2026-10-09"],
    ] as const)
      expect(makeGroup(kind, value, state(), today).canCreate).toBe(false);
  });
});

describe("property-specific drops", () => {
  it("retains a positional preview when its moved source covers the target", () => {
    const a = asOccurrence(task("a"));
    const b = asOccurrence(task("b"));
    const group = makeGroup("priority", "none", state(), today);
    group.tasks = [a, b];
    const previous = groupDestination(b, group.id, group, true, a.id)!;
    expect(
      groupDestination(b, group.id, group, true, b.id, false, false, previous),
    ).toBe(previous);
    expect(
      groupDestination(b, group.id, group, false, b.id, false, false, previous),
    ).toBeNull();
  });
  const original = task("source", {
    priority: "low",
    schedule: { date: today, time: "09:15", duration: 90 },
    deadline: { date: "2026-10-15", time: "17:00" },
  });
  it("changes only the requested date or priority", () => {
    const t = asOccurrence(original);
    expect(groupDraft(t, { kind: "schedule", value: "2026-10-20" })).toEqual({
      ...t,
      schedule: { ...t.schedule, date: "2026-10-20" },
    });
    expect(groupDraft(t, { kind: "deadline", value: "2026-10-20" })).toEqual({
      ...t,
      deadline: { ...t.deadline, date: "2026-10-20" },
    });
    expect(groupDraft(t, { kind: "priority", value: "high" })).toEqual({
      ...t,
      priority: "high",
    });
    expect(groupDraft(t, { kind: "schedule", value: null })).toEqual({
      ...t,
      schedule: undefined,
    });
    expect(groupDraft(t, { kind: "deadline", value: null })).toEqual({
      ...t,
      deadline: undefined,
    });
  });
  it("allows property changes under automatic sorting but rejects same-group ordering", () => {
    const t = asOccurrence(original);
    const group = makeGroup("priority", "high", state(), today);
    expect(groupDestination(t, "source-group", group, false)?.intent).toBe(
      "location",
    );
    expect(groupDestination(t, group.id, group, false, "other")).toBeNull();
    for (const kind of ["today", "upcoming", "none"] as const)
      expect(
        groupDestination(
          t,
          "source-group",
          makeGroup(kind, today, state(), today),
          true,
        ),
      ).toBeNull();
  });
  it("preserves section within the same project and clears it when changing project", () => {
    const workspace = state([original]);
    workspace.projects.push({ id: "q", name: "Other", color: "sky" });
    const t = asOccurrence(original);
    const drop = (value: string) =>
      groupDropAction(
        workspace,
        t,
        {
          kind: "aggregate-group",
          intent: "location",
          ids: [],
          group: makeGroup("project", value, workspace, today),
        },
        [t],
        today,
      );
    expect(reducer(workspace, drop("p")).tasks[0].sectionId).toBe("a");
    const moved = reducer(workspace, drop("q")).tasks[0];
    expect(moved).toMatchObject({
      projectId: "q",
      sectionId: null,
      order: original.order,
      priority: "low",
      schedule: original.schedule,
      deadline: original.deadline,
    });
  });
  it("rejects project transfers requiring subtask detachment", () => {
    const workspace = state([original, child("child", "source")]);
    const t = resolveOccurrence(workspace, { taskId: "child" })!;
    expect(() =>
      groupDropAction(
        workspace,
        t,
        {
          kind: "aggregate-group",
          intent: "location",
          ids: [],
          group: makeGroup("project", null, workspace, today),
        },
        [t],
        today,
      ),
    ).toThrow(/location controls/);
  });
  it("completes and reopens without relocating", () => {
    const workspace = state([original]);
    const t = asOccurrence(original);
    const next = reducer(
      workspace,
      groupDropAction(
        workspace,
        t,
        {
          kind: "aggregate-group",
          intent: "location",
          ids: [],
          group: makeGroup("status", "completed", workspace, today),
        },
        [t],
        today,
      ),
    );
    expect(next.tasks[0]).toEqual({ ...original, completed: true });
    const reopened = reducer(
      next,
      groupDropAction(
        next,
        asOccurrence(next.tasks[0]),
        {
          kind: "aggregate-group",
          intent: "location",
          ids: [],
          group: makeGroup("status", "open", next, today),
        },
        [t],
        today,
      ),
    );
    expect(reopened.tasks[0]).toEqual(original);
  });
  it("retains recurrence validation and occurrence-only changes", () => {
    const workspace = state([
      task("repeat", {
        schedule: { date: today, duration: 30 },
        recurrence: daily,
      }),
    ]);
    const tasks = expandTasks(workspace, today, addDays(today, 1));
    const destination = {
      kind: "aggregate-group" as const,
      intent: "location" as const,
      ids: [],
      group: makeGroup("schedule", null, workspace, today),
    };
    expect(() =>
      groupDropAction(workspace, tasks[0], destination, tasks, today),
    ).toThrow(/scheduled date or deadline/);
    const next = reducer(
      workspace,
      groupDropAction(
        workspace,
        tasks[0],
        {
          ...destination,
          group: makeGroup("priority", "high", workspace, today),
        },
        tasks,
        today,
      ),
    );
    expect(
      expandTasks(next, today, addDays(today, 1)).map((t) => t.priority),
    ).toEqual(["high", "none"]);
  });
  it("manual ordering preserves hidden tasks' relative order and all hierarchy", () => {
    const workspace = state([
      task("a", { order: 0 }),
      task("hidden1", { order: 1 }),
      task("hidden2", { order: 2 }),
      task("b", { order: 3, projectId: null, sectionId: null }),
    ]);
    const tasks = workspace.tasks.map(asOccurrence);
    const destination = {
      kind: "aggregate-group" as const,
      intent: "before" as const,
      ids: [tasks[3].id, tasks[0].id],
      group: makeGroup("priority", "none", workspace, today),
    };
    const next = reducer(
      workspace,
      groupDropAction(workspace, tasks[3], destination, tasks, today),
    );
    expect(
      [...next.tasks].sort((a, b) => a.order - b.order).map((t) => t.id),
    ).toEqual(["b", "hidden1", "hidden2", "a"]);
    next.tasks.forEach((t, i) =>
      expect({ ...t, order: workspace.tasks[i].order }).toEqual(
        workspace.tasks[i],
      ),
    );
  });
});
