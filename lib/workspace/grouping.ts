import { addDays } from "@/lib/dates";
import {
  type Occurrence,
  priorities,
  type Priority,
} from "@/types-and-constants/tasks";
import { type Workspace } from "@/types-and-constants/workspace";

export type GroupKind =
  | "none"
  | "today"
  | "upcoming"
  | "project"
  | "priority"
  | "schedule"
  | "deadline"
  | "status";
export type GroupValue = string | null;
export type TaskAppearance = {
  id: string;
  task: Occurrence;
  roles: ("Scheduled" | "Due")[];
};
export type TaskGroup = {
  id: string;
  kind: GroupKind;
  value: GroupValue;
  label: string;
  tasks: Occurrence[];
  appearances: TaskAppearance[];
  canCreate: boolean;
  canDrop: boolean;
};

export const aggregateGroupings: Record<string, GroupKind[]> = {
  today: ["today", "project", "priority", "none"],
  upcoming: ["upcoming", "project", "priority", "schedule", "deadline", "none"],
  tasks: ["none", "project", "priority", "schedule", "deadline", "status"],
};

/** Identifies aggregate views.
 * @param view Current route view.
 * @returns {boolean} Whether the view has aggregate group semantics.
 * @example isAggregateView("today") // true
 */
export function isAggregateView(view: string): boolean {
  return Object.hasOwn(aggregateGroupings, view);
}

/** Resolves a supported grouping, falling back to the view default.
 * @param view Current route view.
 * @param params Route query parameters.
 * @returns {GroupKind} Effective grouping used by controls and rendering.
 * @example resolveGrouping("today", new URLSearchParams("group=status")) // "today"
 */
export function resolveGrouping(
  view: string,
  params: URLSearchParams,
): GroupKind {
  const allowed = aggregateGroupings[view] ?? [
    "none",
    "project",
    "priority",
    "schedule",
    "deadline",
    "status",
  ];
  const requested = params.get("group") as GroupKind;
  return allowed.includes(requested) ? requested : allowed[0];
}

/** Resolves fixed inclusive Upcoming intervals and legacy numeric ranges.
 * @param today Workspace-local current date key.
 * @param raw Requested day count.
 * @returns {{ days: 7 | 30 | 365; start: string; end: string }} Inclusive interval, defaulting invalid input to 30 days.
 * @example upcomingRange("2026-12-30", "7").end // "2027-01-05"
 */
export function upcomingRange(today: string, raw: string | null) {
  const value = Number(raw);
  const days: 7 | 30 | 365 =
    !Number.isFinite(value) || value <= 0
      ? 30
      : value <= 7
        ? 7
        : value <= 30
          ? 30
          : 365;
  return { days, start: today, end: addDays(today, days - 1) };
}

/** Builds a stable descriptor independently of its contents.
 * @param kind Property or overview grouping.
 * @param value Destination value; null means no date or Inbox.
 * @param state Workspace project metadata.
 * @param today Workspace-local current date.
 * @returns {TaskGroup} Empty group with label and supported actions.
 * @example makeGroup("priority", "high", state, today).canDrop // true
 */
export function makeGroup(
  kind: GroupKind,
  value: GroupValue,
  state: Pick<Workspace, "projects">,
  today: string,
): TaskGroup {
  let label = value ?? "No date";
  if (kind === "none") label = "Tasks";
  if (kind === "project")
    label = state.projects.find((p) => p.id === value)?.name ?? "Inbox";
  if (kind === "priority")
    label =
      value === "none"
        ? "No priority"
        : `${value![0].toUpperCase()}${value!.slice(1)} priority`;
  if (kind === "status") label = value === "completed" ? "Completed" : "Open";
  if (kind === "today") label = value === "overdue" ? "Overdue" : "Today";
  if (kind === "schedule" && value === null) label = "No scheduled date";
  if (kind === "deadline" && value === null) label = "No due date";
  return {
    id: JSON.stringify([kind, value]),
    kind,
    value,
    label,
    tasks: [],
    appearances: [],
    canCreate:
      !(kind === "today" && value === "overdue") &&
      !(kind === "status" && value === "completed") &&
      !(
        ["schedule", "deadline", "upcoming"].includes(kind) &&
        value !== null &&
        value < today
      ),
    canDrop: ["project", "priority", "schedule", "deadline", "status"].includes(
      kind,
    ),
  };
}

/** Groups occurrences by stable properties, retaining Upcoming appearance roles.
 * @param tasks Matching occurrences with inherited locations resolved.
 * @param state Workspace project metadata.
 * @param view Current view.
 * @param params Group and range parameters.
 * @param today Workspace-local date.
 * @returns {TaskGroup[]} Populated groups; date groups are chronological with no-date last.
 * @example groupTasks(tasks, state, "upcoming", params, today)
 */
export function groupTasks(
  tasks: Occurrence[],
  state: Pick<Workspace, "projects">,
  view: string,
  params: URLSearchParams,
  today: string,
): TaskGroup[] {
  const groups = new Map<string, TaskGroup>();
  const kind = resolveGrouping(view, params);
  const range = upcomingRange(today, params.get("range"));
  for (const task of tasks) {
    let values: GroupValue[] = [null];
    if (kind === "today")
      values = [
        task.deadline && task.deadline.date < today && !task.completed
          ? "overdue"
          : "today",
      ];
    if (kind === "upcoming")
      values = [
        ...new Set(
          [task.schedule?.date, task.deadline?.date].filter(
            (d): d is string => !!d && d >= range.start && d <= range.end,
          ),
        ),
      ];
    if (kind === "project") values = [task.projectId];
    if (kind === "priority") values = [task.priority];
    if (kind === "status") values = [task.completed ? "completed" : "open"];
    if (kind === "schedule" || kind === "deadline")
      values = [task[kind]?.date ?? null];
    for (const value of values) {
      const descriptor = makeGroup(kind, value, state, today);
      const group = groups.get(descriptor.id) ?? descriptor;
      group.tasks.push(task);
      const roles: TaskAppearance["roles"] = [];
      if (kind === "upcoming") {
        if (task.schedule?.date === value) roles.push("Scheduled");
        if (task.deadline?.date === value) roles.push("Due");
      }
      group.appearances.push({ id: `${group.id}:${task.id}`, task, roles });
      groups.set(group.id, group);
    }
  }
  const result = [...groups.values()];
  if (["upcoming", "schedule", "deadline"].includes(kind))
    result.sort((a, b) => (a.value ?? "9999").localeCompare(b.value ?? "9999"));
  if (kind === "today")
    result.sort(
      (a, b) => Number(b.value === "overdue") - Number(a.value === "overdue"),
    );
  return result;
}

/** Supplies finite empty destinations compatible with explicit filters.
 * @param kind Effective grouping.
 * @param state Available projects.
 * @param params Explicit filters.
 * @param today Workspace date.
 * @returns {TaskGroup[]} Empty descriptors to merge with populated groups during dragging.
 * @example emptyGroupTargets("priority", state, params, today)
 */
export function emptyGroupTargets(
  kind: GroupKind,
  state: Pick<Workspace, "projects">,
  params: URLSearchParams,
  today: string,
): TaskGroup[] {
  let values: GroupValue[] = [];
  if (kind === "project")
    values = params.get("project")
      ? [params.get("project")]
      : [null, ...state.projects.map((p) => p.id)];
  if (kind === "priority")
    values = params.get("priority") ? [params.get("priority")] : priorities;
  if (kind === "status")
    values =
      (params.get("status") ?? "open") === "all"
        ? ["open", "completed"]
        : [params.get("status") ?? "open"];
  if (kind === "schedule" && params.get("scheduled") !== "yes") values = [null];
  if (kind === "deadline" && !params.get("from") && !params.get("to"))
    values = [null];
  return values.map((value) => makeGroup(kind, value, state, today));
}

export type TaskCreationContext = { group?: Pick<TaskGroup, "kind" | "value"> };

/** Combines view, filter, and clicked-group defaults without pre-completing tasks.
 * @param view Aggregate view name.
 * @param params Explicit filters.
 * @param today Workspace-local date.
 * @param context Optional clicked destination.
 * @returns {Partial<Occurrence>} Editable defaults; undefined date fields explicitly clear dates.
 * @example creationDefaults("today", new URLSearchParams("scheduled=no"), today) // deadline today
 */
export function creationDefaults(
  view: string,
  params: URLSearchParams,
  today: string,
  context: TaskCreationContext = {},
): Partial<Occurrence> {
  const defaults: Partial<Occurrence> = {
    projectId: params.get("project") || null,
    sectionId: null,
    completed: false,
  };
  if (priorities.includes(params.get("priority") as Priority))
    defaults.priority = params.get("priority") as Priority;
  if (params.get("tag")) defaults.tagIds = [params.get("tag")!];
  if (
    view === "today" ||
    view === "upcoming" ||
    params.get("scheduled") === "yes"
  )
    defaults.schedule = { date: today, duration: 30 };
  if (params.get("from") && params.get("from") === params.get("to"))
    defaults.deadline = { date: params.get("from")! };
  if (params.get("scheduled") === "no") defaults.schedule = undefined;
  const group = context.group;
  if (group?.kind === "project") defaults.projectId = group.value;
  if (group?.kind === "priority") defaults.priority = group.value as Priority;
  if (group?.kind === "schedule" || group?.kind === "upcoming")
    defaults.schedule = group.value
      ? { date: group.value, duration: 30 }
      : undefined;
  if (group?.kind === "deadline")
    defaults.deadline = group.value ? { date: group.value } : undefined;
  if (
    (view === "today" || view === "upcoming") &&
    !defaults.schedule &&
    !defaults.deadline &&
    group?.kind !== "deadline"
  )
    defaults.deadline = { date: today };
  return defaults;
}
