import type { Tag, Workspace } from "./types";

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

function ordered(tags: Tag[], parentId: string | null, ids: string[]): Tag[] {
  const positions = new Map(ids.map((id, order) => [id, order]));
  return tags.map((tag) =>
    positions.has(tag.id)
      ? { ...tag, parentId, order: positions.get(tag.id)! }
      : tag,
  );
}

export function moveTag(
  state: Workspace,
  id: string,
  parentId: string | null,
  beforeId?: string,
): Workspace {
  const index = tagIndex(state.tags),
    tag = index.byId.get(id);
  if (!tag) throw new Error("This tag no longer exists.");
  if (
    parentId !== null &&
    (!index.byId.has(parentId) || index.contains(id, parentId))
  )
    throw new Error("Choose a parent outside this tag's subtree.");
  if (beforeId === id && tag.parentId === parentId) return state;
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
  let tags = ordered(state.tags, tag.parentId, source);
  tags = ordered(tags, parentId, destination);
  if (
    tags.every(
      (t, i) =>
        t.parentId === state.tags[i].parentId &&
        t.order === state.tags[i].order,
    )
  )
    return state;
  tagIndex(tags);
  return { ...state, tags };
}

export function saveTag(state: Workspace, tag: Tag): Workspace {
  const index = tagIndex(state.tags),
    previous = index.byId.get(tag.id);
  if (!tag.name.trim()) throw new Error("Enter a tag name.");
  if (previous) {
    const moved =
      previous.parentId === tag.parentId
        ? state
        : moveTag(state, tag.id, tag.parentId);
    if (
      moved === state &&
      previous.name === tag.name &&
      previous.color === tag.color
    )
      return state;
    return {
      ...moved,
      tags: moved.tags.map((t) =>
        t.id === tag.id ? { ...t, name: tag.name, color: tag.color } : t,
      ),
    };
  }
  const tags = [
    ...state.tags,
    { ...tag, order: (index.children.get(tag.parentId) ?? []).length },
  ];
  tagIndex(tags);
  return { ...state, tags };
}

export function deleteTag(state: Workspace, id: string): Workspace {
  const index = tagIndex(state.tags),
    tag = index.byId.get(id);
  if (!tag) return state;
  const siblings = (index.children.get(tag.parentId) ?? []).flatMap((t) =>
    t.id === id ? (index.children.get(id) ?? []).map((c) => c.id) : [t.id],
  );
  const tags = ordered(
    state.tags.filter((t) => t.id !== id),
    tag.parentId,
    siblings,
  );
  tagIndex(tags);
  return {
    ...state,
    tags,
    tasks: state.tasks.map((t) =>
      t.tagIds.includes(id)
        ? { ...t, tagIds: t.tagIds.filter((key) => key !== id) }
        : t,
    ),
    exceptions: Object.fromEntries(
      Object.entries(state.exceptions).map(([key, e]) => [
        key,
        e.overrides.tagIds?.includes(id)
          ? {
              ...e,
              overrides: {
                ...e.overrides,
                tagIds: e.overrides.tagIds.filter((key) => key !== id),
              },
            }
          : e,
      ]),
    ),
  };
}
