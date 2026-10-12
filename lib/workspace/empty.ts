import type { Workspace } from "@/types-and-constants/workspace";

/**
 * Creates an account workspace without sample tasks.
 * @param timezone Valid IANA timezone for the new workspace.
 * @returns {Workspace} An empty version-2 workspace using system theme.
 * @example emptyWorkspace("America/Sao_Paulo");
 */
export function emptyWorkspace(timezone = "UTC"): Workspace {
  return {
    version: 2,
    timezone,
    theme: "system",
    tasks: [],
    projects: [],
    tags: [],
    sections: [],
    layouts: {},
    exceptions: {},
  };
}
