/**
 * Returns the stable layout-storage key for a project container.
 * @param projectId Project ID, or `null` for the inbox.
 * @returns {string} The literal `"inbox"` when `projectId` is `null`; otherwise `"project:<projectId>"`.
 * @example `containerKey(null)` returns `"inbox"`.
 */
export const containerKey = (projectId: string | null) =>
  projectId === null ? "inbox" : `project:${projectId}`;
