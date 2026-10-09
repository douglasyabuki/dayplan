import { tagIndex } from "@/lib/tags/hierarchy";
import type { Tag } from "@/types-and-constants/tags";

/**
 * Reassigns parent and sibling order for the tag IDs in a sequence.
 * @param tags Existing tags.
 * @param parentId Parent ID to assign, or `null` for root tags.
 * @param ids Tag IDs in the desired order.
 * @returns {Tag[]} A new array where each tag whose ID occurs in `ids` has `parentId` and `order` set to the requested parent and that ID's index; other tags are returned unchanged.
 * @example `ordered(tags, null, ["work", "home"])` orders those tags at the root.
 */
function ordered(tags: Tag[], parentId: string | null, ids: string[]): Tag[] {
  const positions = new Map(ids.map((id, order) => [id, order]));
  return tags.map((tag) =>
    positions.has(tag.id)
      ? { ...tag, parentId, order: positions.get(tag.id)! }
      : tag,
  );
}

/**
 * Moves a tag to a parent and position while preserving sibling order.
 * @param items Existing tag hierarchy.
 * @param id Tag ID to move.
 * @param parentId Destination parent ID, or `null` to move the tag to the root.
 * @param beforeId Optional sibling ID to insert before; omitted appends the tag.
 * @returns {Tag[]} The original `items` array when the tag is already at that position; otherwise a new ordered tag array. Throws if the tag is missing, the destination parent is invalid or inside the moved subtree, or `beforeId` is not a destination sibling.
 * @example `moveTag(tags, "child", "parent")` moves `child` to the end of `parent`'s children.
 */
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

/**
 * Deletes a tag and promotes its children to the deleted tag's parent.
 * @param items Existing tag hierarchy.
 * @param id Tag ID to delete.
 * @returns {Tag[]} The original `items` array when `id` is absent; otherwise a new array without that tag, with its direct children promoted to its former parent and siblings reindexed.
 * @example `deleteTag(tags, "parent")` removes `parent` and promotes its children.
 */
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

/**
 * Validates and inserts or updates a tag in the hierarchy.
 * @param tags Existing tags.
 * @param tag Tag values to save.
 * @returns {Tag[]} The original `tags` array when an existing tag's name, color, and parent are unchanged; otherwise a new array with an existing tag's name/color updated and parent move applied, or a new tag appended with its sibling order. Other existing tag fields are preserved. Throws when the name is blank or the resulting hierarchy is invalid.
 * @example `saveTag(tags, tag)` updates a tag or appends a new sibling.
 */
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
