import type { Section } from "@/types-and-constants/sections";
import type { Occurrence, TaskReference } from "@/types-and-constants/tasks";
import type { Workspace } from "@/types-and-constants/workspace";

import { taskIndex } from "./hierarchy";
import {
  isOccurrenceDate,
  occurrenceParent,
  recurrenceRoot,
  reference,
  referenceKey,
  resolveOccurrence,
} from "./recurrence";

/**
 * Chooses whether a pointer is before, after, or inside a task title region.
 * @param point Pointer coordinates.
 * @param title Task title bounds.
 * @param retainInside Whether to keep an existing inside intent across small movements.
 * @returns {"before" | "after" | "inside"} `"inside"` when `x` is from `title.left` through `title.left + min(title.width, 240)` and vertical distance from the midpoint is at most `min(6, title.height * 0.15)`, or (when `retainInside`) at most `max(entryBand, min(14, title.height * 0.75))`; otherwise `"before"` above the midpoint or `"after"` below it.
 * @example `taskPointerIntent(point, title)` returns `"inside"` when the pointer is in the title's narrow center band.
 */
export function taskPointerIntent(
  point: { x: number; y: number },
  title: { left: number; top: number; width: number; height: number },
  retainInside = false,
): "before" | "after" | "inside" {
  const middle = title.top + title.height / 2;
  const entryBand = Math.min(6, title.height * 0.15);
  // Once nesting is shown, give the pointer a wider exit band so tiny movements
  // around the title center don't immediately turn the target into a reorder.
  const halfBand = retainInside
    ? Math.max(entryBand, Math.min(14, title.height * 0.75))
    : entryBand;
  if (
    title.width > 0 &&
    title.height > 0 &&
    point.x >= title.left &&
    point.x <= title.left + Math.min(title.width, 240) &&
    Math.abs(point.y - middle) <= halfBand
  )
    return "inside";
  return point.y < middle ? "before" : "after";
}

/**
 * Inserts a source ID around a target ID in an ordered ID list.
 * @param ids Current ordered IDs.
 * @param sourceId ID being moved.
 * @param targetId Optional target ID; omitted appends the source.
 * @param after Whether to insert after the target instead of before it.
 * @returns {{ ids: string[]; beforeId: string | undefined; index: number } | null} `null` when source and target match, the target is missing, or the resulting order is unchanged; otherwise the new full `ids` order, the following item's ID as `beforeId` (or `undefined` when appended), and the source's new `index`.
 * @example `insertion(["a", "b"], "b", "a")` returns the order `["b", "a"]`.
 */
export function insertion(
  ids: string[],
  sourceId: string,
  targetId?: string,
  after = false,
) {
  if (sourceId === targetId) return null;
  const remaining = ids.filter((id) => id !== sourceId);
  const targetIndex = targetId ? remaining.indexOf(targetId) : -1;
  if (targetId !== undefined && targetIndex < 0) return null;
  const index =
    targetIndex < 0 ? remaining.length : targetIndex + Number(after);
  const next = [...remaining];
  next.splice(index, 0, sourceId);
  if (next.length === ids.length && next.every((id, i) => id === ids[i]))
    return null;
  return { ids: next, beforeId: remaining[index], index };
}
export type DragDestination = {
  kind: "section" | "task";
  intent?: "before" | "after" | "inside" | "location";
  targetId?: string;
  parentRef?: TaskReference | null;
  projectId?: string | null;
  sectionId?: string | null;
  ids: string[];
  beforeId?: string;
  completed?: boolean;
  statusOnly?: boolean;
};

/**
 * Applies a drag destination order to mounted sibling items.
 * @param items Mounted sibling items with IDs.
 * @param destination Proposed drag destination, if any.
 * @returns {T[]} The original `items` array when there is no destination, the intent is `inside`, destination length differs from `items.length`, or an ID is unknown; otherwise a new array mapped from `destination.ids` to matching item objects (including repeated IDs if supplied).
 * @example `previewOrder(items, destination)` shows a same-list reorder before it is persisted.
 */
export function previewOrder<T extends { id: string }>(
  items: T[],
  destination: DragDestination | null,
) {
  if (!destination || destination.intent === "inside") return items;
  const ids = new Set(items.map((item) => item.id));
  if (
    destination.ids.length !== items.length ||
    destination.ids.some((id) => !ids.has(id))
  )
    return items;
  const byId = new Map(items.map((item) => [item.id, item]));
  return destination.ids.map((id) => byId.get(id)!);
}

/**
 * Builds a display list that previews an incoming task without unmounting its source.
 * @param items Visible destination occurrences.
 * @param source Dragged occurrence, when available.
 * @param destination Proposed destination.
 * @param location Optional explicit parent and location of the destination list.
 * @returns {Array<{ task: Occurrence; preview: boolean }>} Entries for the visible list; `preview` is `true` only for an inserted incoming source, and is `false` for every ordinary visible occurrence.
 * @example `taskPreviewEntries(items, draggedTask, destination)` inserts a presentation-only preview row.
 */
export function taskPreviewEntries(
  items: Occurrence[],
  source: Occurrence | undefined,
  destination: DragDestination | null,
  location?: {
    parentRef?: TaskReference | null;
    projectId: string | null;
    sectionId: string | null;
    completed?: boolean;
  },
) {
  const normal = () =>
    previewOrder(
      items,
      destination
        ? {
            ...destination,
            ids: destination.ids.filter((id) => items.some((t) => t.id === id)),
          }
        : null,
    ).map((task) => ({ task, preview: false }));
  if (
    !source ||
    destination?.kind !== "task" ||
    destination.intent === "inside" ||
    items.some((t) => t.id === source.id)
  )
    return normal();
  const matches = location
    ? location.parentRef
      ? !!destination.parentRef &&
        referenceKey(location.parentRef) === referenceKey(destination.parentRef)
      : !destination.parentRef &&
        location.projectId === destination.projectId &&
        location.sectionId === destination.sectionId
    : items.some((t) => t.id === destination.targetId);
  if (
    !matches ||
    (location?.completed !== undefined &&
      location.completed !== (destination.completed ?? source.completed))
  )
    return normal();
  const entries = items.map((task) => ({ task, preview: false }));
  // Hidden siblings do not have slots; find the next visible sibling in the
  // proposed order, or append when this is an empty/filtered destination.
  const following = destination.ids.slice(
    destination.ids.indexOf(source.id) + 1,
  );
  const before = following.find((id) => items.some((t) => t.id === id));
  const index = before
    ? entries.findIndex((entry) => entry.task.id === before)
    : entries.length;
  entries.splice(index, 0, { task: source, preview: true });
  return entries;
}

/**
 * Resolves drag metadata into a validated section or task destination.
 * @param sourceData Metadata for the dragged item.
 * @param data Metadata for the current drop target.
 * @param after Whether the source is positioned after the target.
 * @param intent Pointer intent relative to a task target.
 * @param manual Whether manual task ordering is enabled.
 * @param sections Sections available in the workspace.
 * @param projectId Current project location.
 * @param allTasks All task occurrences available for resolving the move.
 * @param visible Currently visible task occurrences.
 * @param groups Optional grouped occurrences supplied by the current view.
 * @param canceled Whether the drag was canceled.
 * @param previous Previous destination retained during pointer movement.
 * @param state Current workspace state.
 * @returns {DragDestination | null} `null` for canceled, invalid, cyclic, stale, or unchanged drops; otherwise a destination with `kind`, ordered `ids`, and the applicable target, parent, project, section, completion, and status-only fields.
 * @example `dragDestination({ ...input })` returns a section reorder or task move destination for a valid drop.
 */
export function dragDestination({
  sourceData,
  data,
  after,
  intent,
  manual,
  sections,
  projectId,
  allTasks,
  visible,
  canceled = false,
  previous = null,
  state,
}: {
  sourceData: Record<string, unknown> | null;
  data: Record<string, unknown> | null;
  after: boolean;
  intent?: "before" | "after" | "inside";
  manual: boolean;
  sections: Section[];
  projectId: string | null;
  allTasks: Occurrence[];
  visible: Occurrence[];
  groups?: [string, Occurrence[]][];
  canceled?: boolean;
  previous?: DragDestination | null;
  state: Workspace;
}): DragDestination | null {
  if (canceled || !sourceData || !data) return null;
  if (sourceData.kind === "section") {
    if (data.kind !== "section" || !data.sectionId) return null;
    if (sourceData.sectionId === data.sectionId)
      return previous?.kind === "section" ? previous : null;
    const ids = sections
      .filter((s) => s.projectId === projectId)
      .sort((a, b) => a.order - b.order)
      .map((s) => s.id);
    const result = insertion(
      ids,
      String(sourceData.sectionId),
      String(data.sectionId),
      after,
    );
    return result ? { kind: "section", ...result } : null;
  }
  const task = allTasks.find((t) => t.id === sourceData.taskId);
  if (!task || task.archived) return null;
  const statusGroup = data.kind === "status-group";
  const groupParent = statusGroup
    ? (data.parentRef as TaskReference | null)
    : null;
  const target = groupParent
    ? resolveOccurrence(state, groupParent)
    : allTasks.find((t) => t.id === data.taskId);
  if (groupParent && !target) return null;
  if (target?.id === task.id) {
    // Only a sibling preview actually moves the mounted source. For every
    // other destination, hitting its original card means abandoning that move.
    if (
      statusGroup ||
      data.kind === "task-children" ||
      previous?.kind !== "task" ||
      previous.intent === "inside"
    )
      return null;
    const parent = occurrenceParent(state, task);
    const sameParent = parent
      ? !!previous.parentRef &&
        referenceKey(parent) === referenceKey(previous.parentRef)
      : !previous.parentRef;
    return sameParent &&
      previous.projectId === task.projectId &&
      previous.sectionId === task.sectionId &&
      (previous.completed === undefined ||
        previous.completed === task.completed)
      ? previous
      : null;
  }
  let parentRef: TaskReference | null = null;
  let destinationProject =
    data.kind === "section-remove"
      ? task.projectId
      : data.projectId === undefined
        ? projectId
        : (data.projectId as string | null);
  let sectionId = (data.sectionId as string | null) ?? null;
  const targetIntent = statusGroup
    ? "location"
    : target
      ? data.kind === "task-children"
        ? "inside"
        : (intent ?? (after ? "after" : "before"))
      : "location";
  if (target) {
    if (target.id === task.id || target.archived) return null;
    const index = taskIndex(state.tasks);
    if (
      target.taskId === task.taskId ||
      index.ancestors(target.taskId).some((t) => t.id === task.taskId)
    )
      return null;
    parentRef =
      statusGroup || targetIntent === "inside"
        ? reference(target)
        : occurrenceParent(state, target);
    // Occurrence-only parent placements are not present in the template tree.
    let ancestor = parentRef ? resolveOccurrence(state, parentRef) : undefined;
    const seen = new Set<string>();
    while (ancestor) {
      if (ancestor.taskId === task.taskId || seen.has(ancestor.id)) return null;
      seen.add(ancestor.id);
      const parent = occurrenceParent(state, ancestor);
      ancestor = parent ? resolveOccurrence(state, parent) : undefined;
    }
    destinationProject = target.projectId;
    sectionId = target.sectionId;
  } else if (
    !["status-group", "section-target", "section-remove", "project"].includes(
      String(data.kind),
    )
  )
    return null;
  const completed =
    targetIntent !== "inside" && typeof data.completed === "boolean"
      ? data.completed
      : undefined;
  if (
    sectionId &&
    !sections.some(
      (s) => s.id === sectionId && s.projectId === destinationProject,
    )
  )
    return null;
  const siblings = allTasks
    .filter((t) => {
      const parent = occurrenceParent(state, t);
      return parentRef
        ? !!parent && referenceKey(parent) === referenceKey(parentRef)
        : !parent &&
            !t.parentId &&
            t.projectId === destinationProject &&
            t.sectionId === sectionId;
    })
    .sort((a, b) => a.order - b.order);
  if (targetIntent === "before" || targetIntent === "after") {
    if ((!parentRef || completed !== undefined) && !manual) return null;
    // A visible nested list supplies its complete children, whereas filtered root lists do not.
    if (
      siblings.some(
        (t) =>
          (completed === undefined || t.completed === completed) &&
          !visible.some((v) => v.id === t.id),
      )
    )
      return null;
  }
  const originalParent = occurrenceParent(state, task);
  const sameParent =
    referenceKey(originalParent ?? { taskId: "" }) ===
    referenceKey(parentRef ?? { taskId: "" });
  const statusOnly =
    completed !== undefined &&
    targetIntent === "location" &&
    sameParent &&
    task.projectId === destinationProject &&
    task.sectionId === sectionId;
  if (statusOnly && task.completed === completed) return null;
  if (completed !== undefined && !statusOnly) {
    // Reparenting can change an inherited recurrence context. Do not advertise
    // a drop whose resulting occurrence cannot receive the requested status.
    const template = state.tasks.find((item) => item.id === task.taskId)!;
    const root = template.recurrence
      ? template
      : parentRef
        ? recurrenceRoot(state, parentRef.taskId)
        : undefined;
    if (root) {
      const date =
        (root.id === task.context?.recurrenceRootTaskId
          ? task.context.occurrenceDate
          : parentRef?.context?.occurrenceDate) ??
        task.context?.occurrenceDate ??
        root.schedule?.date ??
        root.deadline?.date;
      if (!date) return null;
      const exception =
        state.exceptions[
          referenceKey({
            taskId: task.taskId,
            context: { recurrenceRootTaskId: root.id, occurrenceDate: date },
          })
        ];
      if (exception?.deleted || (!exception && !isOccurrenceDate(root, date)))
        return null;
    }
  }
  const result = insertion(
    siblings.map((t) => t.id),
    task.id,
    targetIntent === "before" || targetIntent === "after"
      ? target?.id
      : undefined,
    targetIntent === "after",
  );
  if (!result && (completed === undefined || completed === task.completed))
    return null;
  return {
    kind: "task",
    intent: targetIntent,
    targetId: statusGroup ? undefined : target?.id,
    parentRef,
    projectId: destinationProject,
    sectionId,
    ...(statusOnly
      ? { ids: siblings.map((t) => t.id) }
      : (result ?? { ids: siblings.map((t) => t.id) })),
    ...(completed === undefined ? {} : { completed }),
    ...(statusOnly || !result ? { statusOnly: true } : {}),
  };
}
