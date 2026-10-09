import { addDays } from "@/lib/dates";
import { tagIndex } from "@/lib/tags/hierarchy";
import { matchesTag } from "@/lib/tags/selectors";
import { priorities } from "@/types-and-constants/tasks";
import { type Occurrence } from "@/types-and-constants/tasks";
import { type Workspace } from "@/types-and-constants/workspace";

const searchCaches = new WeakMap<
  Workspace["tags"],
  WeakMap<Workspace["projects"], WeakMap<Occurrence, string>>
>();

/**
 * Searches a task's title, description, project, and tag names.
 * @param task Task occurrence to search.
 * @param state Workspace supplying project and tag names.
 * @param query Search text; matching is case-insensitive and trimmed.
 * @returns {boolean} `true` when the trimmed, lowercased query is empty or occurs in the lowercased title, description, project name, or any assigned tag path; otherwise `false`.
 * @example `matchesSearch(task, state, "proposal")` returns `true` when a searchable field contains it.
 */
export function matchesSearch(
  task: Occurrence,
  state: Pick<Workspace, "tags" | "projects">,
  query: string,
) {
  if (!query.trim()) return true;
  let projects = searchCaches.get(state.tags);
  if (!projects) searchCaches.set(state.tags, (projects = new WeakMap()));
  let tasks = projects.get(state.projects);
  if (!tasks) projects.set(state.projects, (tasks = new WeakMap()));
  let text = tasks.get(task);
  if (text === undefined) {
    const index = tagIndex(state.tags);
    text = [
      task.title,
      task.description,
      state.projects.find((p) => p.id === task.projectId)?.name,
      ...task.tagIds.map((id) => index.path(id)),
    ]
      .join(" ")
      .toLowerCase();
    tasks.set(task, text);
  }
  return text.includes(query.toLowerCase().trim());
}

/**
 * Filters and sorts task occurrences according to the selected view and URL parameters.
 * @param tasks Candidate task occurrences.
 * @param state Workspace supplying project and tag metadata.
 * @param view View key such as `today`, `inbox`, or `projects`.
 * @param id Optional selected project or tag ID, depending on the view.
 * @param params URL search parameters containing filters and sort settings.
 * @param today Current date key used for relative-date filters.
 * @returns {Occurrence[]} A new array containing only occurrences that pass the view, status, project, tag, date, priority, schedule, deadline, and text filters, sorted by the selected `sort` parameter (`manual` order by default).
 * @example `selectTasks(tasks, state, "inbox", undefined, new URLSearchParams(), "2026-10-01")` returns open inbox tasks by default.
 */
export function selectTasks(
  tasks: Occurrence[],
  state: Pick<Workspace, "tags" | "projects">,
  view: string,
  id: string | undefined,
  params: URLSearchParams,
  today: string,
): Occurrence[] {
  const index = tagIndex(state.tags);
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
      (view === "tags" && id && !matchesTag(task.tagIds, id, index))
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
    if (
      params.get("tag") &&
      !matchesTag(task.tagIds, params.get("tag")!, index)
    )
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
