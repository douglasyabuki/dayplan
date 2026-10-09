import type { TagIndex } from "@/lib/tags/hierarchy";

/**
 * Checks whether any task tag is the selected tag or one of its descendants.
 * @param ids Tag IDs assigned to a task.
 * @param selected Selected tag ID.
 * @param index Precomputed tag hierarchy index.
 * @returns {boolean} `true` if any ID in `ids` is `selected` or a descendant of it in `index`; otherwise `false`.
 * @example `matchesTag(["child"], "parent", index)` returns `true` when `child` descends from `parent`.
 */
export function matchesTag(ids: string[], selected: string, index: TagIndex) {
  return ids.some((id) => index.contains(selected, id));
}

/**
 * Counts open, unarchived tasks for each tag, including their ancestor tags.
 * @param tasks Tasks with tag IDs and completion/archive state.
 * @param index Precomputed tag hierarchy index.
 * @returns {Map<string, number>} A map from tag ID to the count of open, unarchived tasks carrying that tag or a descendant tag. Each task contributes at most once per tag; IDs with zero matches are absent.
 * @example `tagCounts([{ tagIds: ["child"], completed: false, archived: false }], index)` counts the task for `child` and its ancestors.
 */
export function tagCounts(
  tasks: { tagIds: string[]; completed: boolean; archived: boolean }[],
  index: TagIndex,
) {
  const counts = new Map<string, number>();
  const memberships = new Map<string, string[]>();
  for (const task of tasks) {
    if (task.completed || task.archived) continue;
    const matched = new Set<string>();
    for (const id of task.tagIds) {
      if (!memberships.has(id)) memberships.set(id, index.ancestors(id));
      for (const ancestor of memberships.get(id)!) matched.add(ancestor);
    }
    for (const id of matched) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
