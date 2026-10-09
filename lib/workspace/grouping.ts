import { addDays } from "@/lib/dates";
import { type Occurrence } from "@/types-and-constants/tasks";
import { type Workspace } from "@/types-and-constants/workspace";
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
  state: Pick<Workspace, "projects">,
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
