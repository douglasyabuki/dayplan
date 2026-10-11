import { resolveWorkspaceRoute } from "./routes";

/**
 * Validates a return destination before client navigation.
 * @param value Requested destination, including optional query and fragment.
 * @param origin Current browser origin used to reject external destinations.
 * @returns {string} A recognized workspace pathname with its query and fragment, or `/today` for invalid input.
 * @example safeWorkspaceDestination("/inbox?sort=title#task", "https://dayplan.test") returns the same path.
 */
export function safeWorkspaceDestination(
  value: string | null,
  origin: string,
): string {
  if (!value || value.includes("\\") || /[\u0000-\u0020]/.test(value))
    return "/today";
  try {
    const url = new URL(value, origin);
    if (
      url.origin !== origin ||
      url.username ||
      url.password ||
      !resolveWorkspaceRoute(url.pathname)
    )
      return "/today";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/today";
  }
}
