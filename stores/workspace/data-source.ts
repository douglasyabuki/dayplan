import type { WorkspaceOwner } from "@/stores/session/model";
import type { Workspace } from "@/types-and-constants/workspace";

/**
 * A stable adapter instance bound to one immutable owner and destination.
 * Reuse it across that owner's provider lifetimes so late writes finish before
 * a returning owner's load. Snapshots must be treated as immutable.
 * `load` returns null only for missing data; validation/storage failures throw.
 * Honor cancellation where possible; the provider also ignores late responses.
 */
export interface WorkspaceDataSource {
  readonly owner: WorkspaceOwner;
  load(signal: AbortSignal): Workspace | null | Promise<Workspace | null>;
  save(snapshot: Workspace, signal: AbortSignal): void | Promise<void>;
}
