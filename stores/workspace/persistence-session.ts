import { isPromise, serialized } from "@/stores/persistence/queue";
import type { Workspace } from "@/types-and-constants/workspace";

import type { WorkspaceDataSource } from "./data-source";

/** One provider lifetime. All completions and queued work are cancellation guarded. */
export class WorkspacePersistenceSession {
  private controller = new AbortController();
  private pending: Workspace | null = null;
  private saving = false;
  private resetting = false;
  writable = false;

  constructor(
    readonly source: WorkspaceDataSource,
    private onError: (message: string) => void,
  ) {}

  get active() {
    return !this.controller.signal.aborted;
  }

  close() {
    this.controller.abort();
    this.pending = null;
    this.writable = false;
  }

  load(
    onLoad: (snapshot: Workspace | null) => void,
    onFailure: (cause: unknown) => void,
  ) {
    this.perform(
      () => this.source.load(this.controller.signal),
      (snapshot) => {
        this.writable = true;
        onLoad(snapshot);
      },
      onFailure,
    );
  }

  saveLatest(snapshot: Workspace) {
    if (!this.active || !this.writable) return;
    this.pending = snapshot;
    this.drain();
  }

  reset(snapshot: Workspace, onSaved: () => void) {
    if (!this.active || this.resetting) return;
    this.resetting = true;
    this.pending = null;
    this.perform(
      () => this.source.save(snapshot, this.controller.signal),
      () => {
        this.resetting = false;
        this.pending = null;
        this.writable = true;
        onSaved();
        this.drain();
      },
      () => {
        this.resetting = false;
        this.writable = false;
        this.pending = null;
        this.onError("Storage is still unavailable. Reset was not saved.");
      },
    );
  }

  private drain() {
    if (
      !this.active ||
      !this.writable ||
      this.saving ||
      this.resetting ||
      !this.pending
    )
      return;
    const snapshot = this.pending;
    this.pending = null;
    this.saving = true;
    this.perform(
      () => this.source.save(snapshot, this.controller.signal),
      () => {
        this.saving = false;
        this.drain();
      },
      () => {
        this.saving = false;
        this.writable = false;
        this.pending = null;
        this.onError(
          "Your browser could not save changes. Your current work is still available in this session.",
        );
      },
    );
  }

  private perform<T>(
    operation: () => T | Promise<T>,
    success: (result: T) => void,
    failure: (cause: unknown) => void,
  ) {
    const resolve = (result: T) => {
      if (this.active) success(result);
    };
    const reject = (cause: unknown) => {
      if (this.active) failure(cause);
    };
    try {
      const result = serialized(this.source, this.controller.signal, operation);
      if (isPromise(result)) void result.then(resolve, reject);
      else resolve(result);
    } catch (cause) {
      reject(cause);
    }
  }
}
