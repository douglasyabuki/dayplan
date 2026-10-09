export const workspaceViews = [
  "today",
  "inbox",
  "upcoming",
  "tasks",
  "calendar",
  "search",
  "completed",
  "archive",
  "projects",
  "tags",
] as const;

export type WorkspaceViewName = (typeof workspaceViews)[number];
export type CollectionKind = "projects" | "tags";
export type WorkspaceRoute =
  | { view: Exclude<WorkspaceViewName, CollectionKind>; selectedId?: never }
  | { view: CollectionKind; selectedId?: string };

/** Resolve only supported workspace paths; Next.js pages own route matching. */
export function resolveWorkspaceRoute(pathname: string): WorkspaceRoute | null {
  const parts = pathname.replace(/\/$/, "").split("/");
  if (parts[0] !== "" || parts.length < 2 || parts.length > 3) return null;
  const view = parts[1];
  if (!workspaceViews.some((candidate) => candidate === view)) return null;
  if (parts.length === 3) {
    if ((view !== "projects" && view !== "tags") || !parts[2]) return null;
    try {
      return { view, selectedId: decodeURIComponent(parts[2]) };
    } catch {
      return null;
    }
  }
  return { view: view as WorkspaceViewName };
}

export function workspaceHref(route: WorkspaceRoute): string {
  return `/${route.view}${route.selectedId === undefined ? "" : "/" + encodeURIComponent(route.selectedId)}`;
}

/** Update specified query keys without discarding unrelated state or mutating the input. */
export function workspaceQueryHref(
  pathname: string,
  params: URLSearchParams,
  changes: Record<string, string | null>,
): string {
  const next = new URLSearchParams(params);
  for (const [key, value] of Object.entries(changes)) {
    if (value) next.set(key, value);
    else next.delete(key);
  }
  return pathname + (next.size ? "?" + next.toString() : "");
}
