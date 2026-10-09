import { validateWorkspace } from "@/stores/workspace/validation";
import type { Workspace } from "@/types-and-constants/workspace";
export const STORAGE_KEY = "dayplan.workspace.v2";
export function readWorkspace(): Workspace | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return validateWorkspace(JSON.parse(raw));
}
export function writeWorkspace(state: Workspace) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
