"use client";

import { useEffect, useMemo, useState } from "react";

import { useTagExpansion } from "@/hooks/tags/use-tag-expansion";
import type { useWorkspaceNavigation } from "@/hooks/workspace/use-workspace-navigation";
import { addDays, parseDay } from "@/lib/dates";
import { tagIndex } from "@/lib/tags/hierarchy";
import { tagCounts } from "@/lib/tags/selectors";
import {
  expandTasks,
  occurrenceParent,
  referenceKey,
  resolveOccurrence,
} from "@/lib/tasks/recurrence";
import { groupTasks } from "@/lib/workspace/grouping";
import { containerKey } from "@/lib/workspace/layout";
import type { WorkspaceViewName } from "@/lib/workspace/routes";
import { selectTasks } from "@/lib/workspace/selectors";
import type { Workspace } from "@/types-and-constants/workspace";

const titles: Record<WorkspaceViewName, string> = {
  today: "Today",
  inbox: "Inbox",
  upcoming: "Upcoming",
  tasks: "All tasks",
  calendar: "Calendar",
  search: "Search",
  completed: "Completed",
  archive: "Archive",
  projects: "Projects",
  tags: "Tags",
};
const descriptions: Record<WorkspaceViewName, string> = {
  today: "A fresh start. A little focus. A day well spent.",
  inbox: "Get it out of your head. Give it a home later.",
  upcoming: "A little perspective on what’s ahead.",
  tasks: "Everything on your mind, all in one place.",
  calendar: "Make time for what matters.",
  search: "Find that thing you were thinking about.",
  completed: "Small steps. Real progress.",
  archive: "Out of the way, here when you need it.",
  projects: "Give your ideas a place to grow.",
  tags: "Small connections. A clearer picture.",
};

type WorkspaceViewOptions = Pick<
  ReturnType<typeof useWorkspaceNavigation>,
  "view" | "selectedId" | "params"
> & {
  state: Workspace;
  today: string;
};

/**
 * Derives the visible task, grouping, layout, and selection data for a workspace view.
 * @param {WorkspaceViewOptions} options Workspace state, today's date, and the active route view, selection, and query parameters.
 * @returns {object} View data including tag hierarchy and counts, layout and section flags, the selected date and calendar mode, expanded `allTasks`, filtered `visible` and `hierarchyTasks`, task `groups`, selected entity and title, completion totals, active filters, description, and displayed task, group, and section collections.
 * @example
 * const viewData = useWorkspaceView({ state, today, view, selectedId, params });
 * return <TaskList tasks={viewData.visible} groups={viewData.groups} />;
 */
export function useWorkspaceView({
  state,
  today,
  view,
  selectedId,
  params,
}: WorkspaceViewOptions) {
  const tags = useMemo(() => tagIndex(state.tags), [state.tags]);
  const tagExpansion = useTagExpansion({
    index: tags,
    selectedId: view === "tags" ? selectedId : undefined,
  });
  const sectioned = view === "inbox" || (view === "projects" && !!selectedId);
  const hasLayout = sectioned || ["today", "upcoming", "tasks"].includes(view);
  const projectId = view === "projects" ? (selectedId ?? null) : null;
  const layout = hasLayout
    ? (state.layouts[sectioned ? containerKey(projectId) : `view:${view}`] ??
      "list")
    : "list";
  const showSections =
    sectioned &&
    (layout === "board" || (params.get("group") ?? "sections") === "sections");
  const date =
    /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "") &&
    !Number.isNaN(parseDay(params.get("date")!).getTime())
      ? params.get("date")!
      : today;
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const media = matchMedia("(max-width: 767px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const mode = ["day", "week", "month"].includes(params.get("mode") ?? "")
    ? params.get("mode")!
    : mobile
      ? "day"
      : "week";
  const range = Math.max(30, Math.min(365, Number(params.get("range")) || 30));
  const anchors = state.tasks
    .filter((t) => t.recurrence)
    .map((t) => t.schedule?.date ?? t.deadline?.date ?? today);
  const from = [...anchors, addDays(date, -42), today].sort()[0];
  const to = [addDays(date, 45), addDays(today, range)].sort().at(-1)!;
  const allTasks = useMemo(
    () => expandTasks(state, from, to),
    [state, from, to],
  );
  const countsByTag = useMemo(
    () => tagCounts(allTasks, tags),
    [allTasks, tags],
  );
  const searchMetadata = useMemo(
    () => ({ tags: state.tags, projects: state.projects }),
    [state.tags, state.projects],
  );
  const matches = useMemo(
    () =>
      selectTasks(allTasks, searchMetadata, view, selectedId, params, today),
    [allTasks, searchMetadata, view, selectedId, params, today],
  );
  const hierarchyView = ["inbox", "projects", "tasks"].includes(view);
  const included = new Map(matches.map((t) => [t.id, t]));
  if (hierarchyView)
    for (const match of matches) {
      let current = match;
      const seen = new Set<string>();
      while (!seen.has(current.id)) {
        seen.add(current.id);
        const ref = occurrenceParent(state, current);
        const parent = ref ? resolveOccurrence(state, ref) : undefined;
        if (!parent) break;
        included.set(parent.id, parent);
        current = parent;
      }
    }
  const visible = hierarchyView
    ? [...included.values()].filter((t) => {
        const p = occurrenceParent(state, t);
        return !p || !included.has(referenceKey(p));
      })
    : matches;
  const groups = groupTasks(visible, state, view, params, today);
  const selectedEntity =
    view === "projects"
      ? state.projects.find((p) => p.id === selectedId)
      : view === "tags"
        ? state.tags.find((t) => t.id === selectedId)
        : undefined;
  const title = selectedEntity?.name ?? titles[view] ?? "Today";
  const collection = (view === "projects" || view === "tags") && !selectedId;
  const completedToday = allTasks.filter(
    (t) =>
      !t.archived &&
      t.completed &&
      (t.schedule?.date === today || t.deadline?.date === today),
  ).length;
  const todayTotal = allTasks.filter(
    (t) =>
      !t.archived && (t.schedule?.date === today || t.deadline?.date === today),
  ).length;
  const activeFilters = [
    "project",
    "tag",
    "priority",
    "scheduled",
    "from",
    "to",
    "status",
  ].filter((k) => params.get(k));
  return {
    tags,
    tagExpansion,
    countsByTag,
    sectioned,
    hasLayout,
    projectId,
    layout,
    showSections,
    statusGrouping: showSections && (params.get("status") ?? "open") === "all",
    date,
    mode,
    range,
    allTasks,
    visible,
    hierarchyTasks: [...included.values()],
    groups,
    selectedEntity,
    title,
    collection,
    completedToday,
    todayTotal,
    activeFilters,
    description: descriptions[view],
    // Lists preview sibling order locally, preserving the active source's parent.
    displayedTasks: visible,
    displayedGroups: groups,
    displayedSections: state.sections,
  };
}
