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

/**
 * Resolves a supported workspace pathname into its view and optional collection ID.
 * @param pathname Pathname to parse, such as `/today` or `/projects/work`.
 * @returns {WorkspaceRoute | null} `{ view, selectedId }` for a supported path; `selectedId` is present only for `/projects/:id` and `/tags/:id`. Returns `null` for unsupported paths or invalid encoded IDs.
 * @example `resolveWorkspaceRoute("/projects/work")` returns `{ view: "projects", selectedId: "work" }`.
 */
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

/**
 * Builds the pathname for a workspace view or selected collection.
 * @param route Route to encode.
 * @returns {string} `/<view>` when no ID is selected, or `/<view>/<encoded selectedId>` when one is present.
 * @example `workspaceHref({ view: "projects", selectedId: "work" })` returns `"/projects/work"`.
 */
export function workspaceHref(route: WorkspaceRoute): string {
  return `/${route.view}${route.selectedId === undefined ? "" : "/" + encodeURIComponent(route.selectedId)}`;
}

/**
 * Updates selected query parameters while preserving unrelated parameters.
 * @param pathname Base pathname.
 * @param params Current URL parameters; this input is not mutated.
 * @param changes Query keys to set, or delete when the value is `null` or empty.
 * @returns {string} `pathname` followed by `?` and the serialized updated parameters when any remain; otherwise exactly `pathname`. The input `params` is unchanged.
 * @example `workspaceQueryHref("/tasks", params, { sort: "title" })` returns a path with the new sort setting.
 */
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
