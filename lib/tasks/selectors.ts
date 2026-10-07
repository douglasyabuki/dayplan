import { addDays } from "./dates";
import { type Occurrence, priorities, type Workspace } from "./types";

/**
 * Searches a task's title, description, project, and tag names.
 * @param task Task occurrence to search.
 * @param state Workspace supplying project and tag names.
 * @param query Search text; matching is case-insensitive and trimmed.
 * @returns Whether any searchable task text contains the query.
 * @example `matchesSearch(task, state, "proposal")` returns `true` when a searchable field contains it.
 */
export function matchesSearch(
  task: Occurrence,
  state: Workspace,
  query: string,
) {
  return [
    task.title,
    task.description,
    state.projects.find((p) => p.id === task.projectId)?.name,
    ...state.tags.filter((t) => task.tagIds.includes(t.id)).map((t) => t.name),
  ]
    .join(" ")
    .toLowerCase()
    .includes(query.toLowerCase().trim());
}

/**
 * Filters and sorts task occurrences according to the selected view and URL parameters.
 * @param tasks Candidate task occurrences.
 * @param state Workspace supplying project and tag metadata.
 * @param view View key such as `today`, `inbox`, or `projects`.
 * @param id Optional selected project or tag ID, depending on the view.
 * @param params URL search parameters containing filters and sort settings.
 * @param today Current date key used for relative-date filters.
 * @returns Matching task occurrences in the requested order.
 * @example `selectTasks(tasks, state, "inbox", undefined, new URLSearchParams(), "2026-10-01")` returns open inbox tasks by default.
 */
export function selectTasks(
  tasks: Occurrence[],
  state: Workspace,
  view: string,
  id: string | undefined,
  params: URLSearchParams,
  today: string,
): Occurrence[] {
  const result = tasks.filter((task) => {
    if (view === "archive" ? !task.archived : task.archived) return false;
    const status =
      params.get("status") ??
      (view === "completed"
        ? "completed"
        : view === "archive" || view === "search"
          ? "all"
          : "open");
    if (view === "completed" && !task.completed) return false;
    if (
      (status === "open" && task.completed) ||
      (status === "completed" && !task.completed)
    )
      return false;
    if (view === "inbox" && task.projectId !== null) return false;
    if (
      (view === "projects" && id && task.projectId !== id) ||
      (view === "tags" && id && !task.tagIds.includes(id))
    )
      return false;
    if (
      view === "today" &&
      !(
        task.schedule?.date === today ||
        (task.deadline && task.deadline.date <= today)
      )
    )
      return false;
    if (view === "upcoming") {
      const end = addDays(
        today,
        Math.max(30, Math.min(365, Number(params.get("range")) || 30)),
      );
      if (
        ![task.schedule?.date, task.deadline?.date].some(
          (date) => date && date >= today && date <= end,
        )
      )
        return false;
    }
    if (params.get("project") && task.projectId !== params.get("project"))
      return false;
    if (params.get("tag") && !task.tagIds.includes(params.get("tag")!))
      return false;
    if (params.get("priority") && task.priority !== params.get("priority"))
      return false;
    if (
      (params.get("scheduled") === "yes" && !task.schedule) ||
      (params.get("scheduled") === "no" && task.schedule)
    )
      return false;
    if (
      params.get("from") &&
      (!task.deadline || task.deadline.date < params.get("from")!)
    )
      return false;
    if (
      params.get("to") &&
      (!task.deadline || task.deadline.date > params.get("to")!)
    )
      return false;
    return matchesSearch(task, state, params.get("q") ?? "");
  });
  const sort = params.get("sort") ?? "manual";
  return result.sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    if (sort === "priority")
      return (
        priorities.indexOf(b.priority) - priorities.indexOf(a.priority) ||
        a.order - b.order
      );
    if (sort === "created") return b.createdAt.localeCompare(a.createdAt);
    if (sort === "deadline" || sort === "schedule")
      return `${a[sort]?.date ?? "9999"}${a[sort]?.time ?? ""}`.localeCompare(
        `${b[sort]?.date ?? "9999"}${b[sort]?.time ?? ""}`,
      );
    return a.order - b.order;
  });
}

/**
 * Groups selected tasks by the requested grouping, or by a view-specific default.
 * @param tasks Task occurrences to group.
 * @param state Workspace supplying project names.
 * @param view Current view key, used to choose the default grouping.
 * @param params URL parameters including `group` and upcoming range settings.
 * @param today Current date key for relative groups.
 * @returns Ordered `[group label, tasks]` pairs.
 * @example `groupTasks(tasks, state, "today", new URLSearchParams(), "2026-10-01")` groups tasks into overdue and today's focus.
 */
export function groupTasks(
  tasks: Occurrence[],
  state: Workspace,
  view: string,
  params: URLSearchParams,
  today: string,
): [string, Occurrence[]][] {
  const groups = new Map<string, Occurrence[]>();
  const grouping =
    params.get("group") ??
    (view === "today" ? "today" : view === "upcoming" ? "upcoming" : "none");
  for (const task of tasks) {
    let keys = ["Tasks"];
    if (grouping === "today")
      keys = [
        task.deadline && task.deadline.date < today && !task.completed
          ? "Overdue"
          : "Your focus today",
      ];
    if (grouping === "upcoming")
      keys = [
        ...new Set(
          [task.schedule?.date, task.deadline?.date].filter(
            (d): d is string =>
              !!d &&
              d >= today &&
              d <=
                addDays(
                  today,
                  Math.max(
                    30,
                    Math.min(365, Number(params.get("range")) || 30),
                  ),
                ),
          ),
        ),
      ];
    if (grouping === "project")
      keys = [
        state.projects.find((p) => p.id === task.projectId)?.name ?? "Inbox",
      ];
    if (grouping === "priority")
      keys = [
        task.priority === "none"
          ? "No priority"
          : `${task.priority[0].toUpperCase()}${task.priority.slice(1)} priority`,
      ];
    if (grouping === "status") keys = [task.completed ? "Completed" : "Open"];
    if (grouping === "schedule" || grouping === "deadline")
      keys = [task[grouping]?.date ?? "No date"];
    for (const key of keys) groups.set(key, [...(groups.get(key) ?? []), task]);
  }
  const entries = [...groups.entries()];
  if (["upcoming", "schedule", "deadline"].includes(grouping))
    entries.sort(([a], [b]) => a.localeCompare(b));
  if (grouping === "today") entries.sort(([a]) => (a === "Overdue" ? -1 : 1));
  return entries;
}
