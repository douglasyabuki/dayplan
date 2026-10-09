import type { Tag } from "@/types-and-constants/tags";
export type TagIndex = {
  byId: Map<string, Tag>;
  children: Map<string | null, Tag[]>;
  rows: { tag: Tag; depth: number }[];
  contains: (ancestor: string, id: string) => boolean;
  ancestors: (id: string) => string[];
  path: (id: string) => string;
};

const indexes = new WeakMap<Tag[], TagIndex>();

/** Shared by all consumers; immutable tag arrays are the cache key. */
export function tagIndex(tags: Tag[]): TagIndex {
  const cached = indexes.get(tags);
  if (cached) return cached;
  const byId = new Map<string, Tag>();
  const children = new Map<string | null, Tag[]>();
  for (const tag of tags) {
    if (
      byId.has(tag.id) ||
      !Number.isFinite(tag.order) ||
      (tag.parentId !== null && typeof tag.parentId !== "string")
    )
      throw new Error("Invalid tag hierarchy.");
    byId.set(tag.id, tag);
    const siblings = children.get(tag.parentId) ?? [];
    siblings.push(tag);
    children.set(tag.parentId, siblings);
  }
  for (const tag of tags)
    if (tag.parentId !== null && !byId.has(tag.parentId))
      throw new Error("A tag's parent does not exist.");
  for (const siblings of children.values())
    siblings.sort((a, b) => a.order - b.order);
  const rows: TagIndex["rows"] = [];
  const ranges = new Map<string, [number, number]>();
  const pending = [...(children.get(null) ?? [])]
    .reverse()
    .map((tag) => ({ tag, depth: 0, exit: false }));
  while (pending.length) {
    const entry = pending.pop()!;
    if (entry.exit) {
      ranges.get(entry.tag.id)![1] = rows.length;
      continue;
    }
    ranges.set(entry.tag.id, [rows.length, rows.length]);
    rows.push({ tag: entry.tag, depth: entry.depth });
    pending.push({ ...entry, exit: true });
    const nested = children.get(entry.tag.id) ?? [];
    for (let i = nested.length - 1; i >= 0; i--)
      pending.push({ tag: nested[i], depth: entry.depth + 1, exit: false });
  }
  if (rows.length !== tags.length)
    throw new Error("Tags cannot contain circular relationships.");
  const paths = new Map<string, string>();
  const index: TagIndex = {
    byId,
    children,
    rows,
    contains(ancestor, id) {
      const a = ranges.get(ancestor),
        b = ranges.get(id);
      return !!a && !!b && a[0] <= b[0] && b[0] < a[1];
    },
    ancestors(id) {
      const result: string[] = [];
      let tag = byId.get(id);
      while (tag) {
        result.push(tag.id);
        tag = tag.parentId === null ? undefined : byId.get(tag.parentId);
      }
      return result;
    },
    path(id) {
      if (!paths.has(id))
        paths.set(
          id,
          index
            .ancestors(id)
            .reverse()
            .map((key) => byId.get(key)!.name)
            .join(" / "),
        );
      return paths.get(id)!;
    },
  };
  indexes.set(tags, index);
  return index;
}
