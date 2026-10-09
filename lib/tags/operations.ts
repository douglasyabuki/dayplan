import { tagIndex } from "@/lib/tags/hierarchy";
import type { Tag } from "@/types-and-constants/tags";
function ordered(tags: Tag[], parentId: string | null, ids: string[]): Tag[] {
  const positions = new Map(ids.map((id, order) => [id, order]));
  return tags.map((tag) =>
    positions.has(tag.id)
      ? { ...tag, parentId, order: positions.get(tag.id)! }
      : tag,
  );
}
export function moveTag(
  items: Tag[],
  id: string,
  parentId: string | null,
  beforeId?: string,
): Tag[] {
  const index = tagIndex(items),
    tag = index.byId.get(id);
  if (!tag) throw new Error("This tag no longer exists.");
  if (
    parentId !== null &&
    (!index.byId.has(parentId) || index.contains(id, parentId))
  )
    throw new Error("Choose a parent outside this tag's subtree.");
  if (beforeId === id && tag.parentId === parentId) return items;
  const destination = (index.children.get(parentId) ?? [])
    .filter((t) => t.id !== id)
    .map((t) => t.id);
  if (beforeId !== undefined && !destination.includes(beforeId))
    throw new Error("The destination changed. Please try again.");
  destination.splice(
    beforeId === undefined ? destination.length : destination.indexOf(beforeId),
    0,
    id,
  );
  const source = (index.children.get(tag.parentId) ?? [])
    .filter((t) => t.id !== id)
    .map((t) => t.id);
  let tags = ordered(items, tag.parentId, source);
  tags = ordered(tags, parentId, destination);
  if (
    tags.every(
      (t, i) => t.parentId === items[i].parentId && t.order === items[i].order,
    )
  )
    return items;
  tagIndex(tags);
  return tags;
}
export function deleteTag(items: Tag[], id: string): Tag[] {
  const index = tagIndex(items),
    tag = index.byId.get(id);
  if (!tag) return items;
  const siblings = (index.children.get(tag.parentId) ?? []).flatMap((t) =>
    t.id === id ? (index.children.get(id) ?? []).map((c) => c.id) : [t.id],
  );
  const tags = ordered(
    items.filter((t) => t.id !== id),
    tag.parentId,
    siblings,
  );
  tagIndex(tags);
  return tags;
}
export function saveTag(tags: Tag[], tag: Tag): Tag[] {
  const index = tagIndex(tags),
    previous = index.byId.get(tag.id);
  if (!tag.name.trim()) throw new Error("Enter a tag name.");
  if (previous) {
    const moved =
      previous.parentId === tag.parentId
        ? tags
        : moveTag(tags, tag.id, tag.parentId);
    if (
      moved === tags &&
      previous.name === tag.name &&
      previous.color === tag.color
    )
      return tags;
    return moved.map((t) =>
      t.id === tag.id ? { ...t, name: tag.name, color: tag.color } : t,
    );
  }
  const next = [
    ...tags,
    { ...tag, order: (index.children.get(tag.parentId) ?? []).length },
  ];
  tagIndex(next);
  return next;
}
