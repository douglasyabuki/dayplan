import type { TagIndex } from "@/lib/tags/hierarchy";
export function matchesTag(ids: string[], selected: string, index: TagIndex) {
  return ids.some((id) => index.contains(selected, id));
}

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
