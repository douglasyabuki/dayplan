import { guestOwner } from "@/stores/session/model";
import { validateWorkspace } from "@/stores/workspace/validation";
import type { Workspace } from "@/types-and-constants/workspace";

import type { WorkspaceDataSource } from "./data-source";

export const STORAGE_KEY = "dayplan.workspace.v2";
export function readWorkspace(): Workspace | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return validateWorkspace(JSON.parse(raw));
}
export function writeWorkspace(state: Workspace) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const guestWorkspaceDataSource: WorkspaceDataSource = {
  owner: guestOwner,
  load(signal) {
    signal.throwIfAborted();
    return readWorkspace();
  },
  save(snapshot, signal) {
    signal.throwIfAborted();
    writeWorkspace(snapshot);
  },
};
