import { type DragDestination, insertion } from "@/lib/tasks/drag";
import { validateTaskDraft } from "@/lib/tasks/operations";
import { occurrenceParent } from "@/lib/tasks/recurrence";
import type { TaskGroup } from "@/lib/workspace/grouping";
import type { Action } from "@/stores/workspace/actions";
import { taskAction, taskOperationAction } from "@/stores/workspace/commands";
import { reducer } from "@/stores/workspace/reducer";
import type { Occurrence, Priority } from "@/types-and-constants/tasks";
import type { Workspace } from "@/types-and-constants/workspace";

export type GroupDestination = Extract<
  DragDestination,
  { kind: "aggregate-group" }
>;

/** Resolves an aggregate target without borrowing its task's hierarchy or location.
 * @param task Dragged occurrence.
 * @param sourceGroup Source rendered group ID.
 * @param group Destination descriptor.
 * @param manual Whether positional ordering is enabled.
 * @param targetId Optional task slot.
 * @param after Whether to place after that slot.
 * @param chooseDate Whether the destination opens a date picker.
 * @param previous Prior positional preview, retained when the moved source covers its target slot.
 * @returns {GroupDestination | null} Property destination or same-group reorder; null for prohibited/no-op drops.
 * @example groupDestination(task, sourceId, highPriorityGroup, false)
 */
export function groupDestination(
  task: Occurrence,
  sourceGroup: unknown,
  group: TaskGroup,
  manual: boolean,
  targetId?: string,
  after = false,
  chooseDate = false,
  previous: GroupDestination | null = null,
): GroupDestination | null {
  if (task.archived) return null;
  const sameGroup = sourceGroup === group.id;
  if (sameGroup) {
    if (!manual || !targetId) return null;
    if (
      targetId === task.id &&
      previous?.group.id === group.id &&
      previous.intent !== "location"
    )
      return previous;
    const order = insertion(
      group.tasks.map((t) => t.id),
      task.id,
      targetId,
      after,
    );
    return order
      ? {
          kind: "aggregate-group",
          group,
          intent: after ? "after" : "before",
          targetId,
          ids: order.ids,
        }
      : null;
  }
  if (!group.canDrop) return null;
  // Cross-group drops change the property only, even under Manual ordering.
  return {
    kind: "aggregate-group",
    group,
    ids: [],
    intent: "location",
    chooseDate,
  };
}

/** Builds date/priority edits while preserving every unrelated editable field.
 * @param task Current occurrence.
 * @param group Property destination.
 * @returns {Occurrence} Draft with only the destination property changed.
 * @example groupDraft(task, { kind: "schedule", value: "2027-01-04" })
 */
export function groupDraft(
  task: Occurrence,
  group: Pick<TaskGroup, "kind" | "value">,
): Occurrence {
  if (group.kind === "priority")
    return { ...task, priority: group.value as Priority };
  if (group.kind === "schedule")
    return {
      ...task,
      schedule: group.value
        ? {
            date: group.value,
            time: task.schedule?.time,
            duration: task.schedule?.duration ?? 30,
          }
        : undefined,
    };
  if (group.kind === "deadline")
    return {
      ...task,
      deadline: group.value
        ? { date: group.value, time: task.deadline?.time }
        : undefined,
    };
  return task;
}

/** Applies group semantics as one undoable transaction, validating recurrence and hierarchy.
 * @param state Current workspace.
 * @param task Current dragged occurrence.
 * @param destination Resolved group destination.
 * @param tasks Expanded occurrences for order resolution.
 * @param today Workspace-local date for completion.
 * @returns {Action} Atomic action; throws a user-facing error for invalid moves.
 * @example groupDropAction(state, task, destination, tasks, today)
 */
export function groupDropAction(
  state: Workspace,
  task: Occurrence,
  destination: GroupDestination,
  tasks: Occurrence[],
  today: string,
): Action {
  if (destination.intent !== "location") {
    const selected = [
      ...new Set(
        destination.ids
          .map((id) => tasks.find((t) => t.id === id)?.taskId)
          .filter((id): id is string => !!id),
      ),
    ];
    if (selected.length !== destination.ids.length)
      throw new Error(
        "Repeated occurrences share an order. Reorder the series from its project.",
      );
    // Replace only selected slots in the global stable order; hidden tasks keep their relative order.
    const ordered = [...state.tasks].sort((a, b) => a.order - b.order);
    let slot = 0;
    const ids = ordered.map((t) =>
      selected.includes(t.id) ? selected[slot++] : t.id,
    );
    return {
      type: "batch",
      actions: ids.map((taskId, order) => ({
        type: "patch",
        ref: { taskId },
        changes: { order },
      })),
    };
  }
  const { group } = destination;
  if (group.kind === "project") {
    if (task.projectId === group.value) return { type: "batch", actions: [] };
    if (occurrenceParent(state, task) || task.parentId)
      throw new Error(
        "Move this subtask using its location controls before changing its project.",
      );
    const moved = reducer(
      state,
      taskAction(state, {
        type: "moveTask",
        task,
        tasks,
        parentRef: null,
        projectId: group.value,
        sectionId: null,
      }),
    );
    // A property-group transfer does not request a positional change.
    const orders = new Map(state.tasks.map((t) => [t.id, t.order]));
    return {
      type: "replace",
      state: {
        ...moved,
        tasks: moved.tasks.map((t) => ({
          ...t,
          order: orders.get(t.id) ?? t.order,
        })),
      },
    };
  }
  if (group.kind === "status")
    return taskOperationAction(state, {
      kind: "complete",
      task,
      completed: group.value === "completed",
      today,
    });
  const draft = groupDraft(task, group);
  const error = validateTaskDraft(draft);
  if (error) throw new Error(error);
  // Use the existing occurrence edit path, including explicit clearing and recurrence semantics.
  const action = taskAction(state, { type: "occurrence", task: draft });
  // Validate the transaction before advertising a valid preview.
  reducer(state, action);
  return action;
}
