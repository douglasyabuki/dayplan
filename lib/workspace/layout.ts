/**
 * Returns the stable layout-storage key for a project container.
 * @param projectId Project ID, or `null` for the inbox.
 * @returns `inbox` for the inbox, otherwise a `project:<id>` key.
 * @example `containerKey(null)` returns `"inbox"`.
 */
export const containerKey = (projectId: string | null) =>
  projectId === null ? "inbox" : `project:${projectId}`;
