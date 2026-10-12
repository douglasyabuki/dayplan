import { isPromise, serialized } from "@/stores/persistence/queue";
import type { Workspace } from "@/types-and-constants/workspace";

import type { WorkspaceDataSource } from "./data-source";

/** One provider lifetime. All completions and queued work are cancellation guarded. */
export class WorkspacePersistenceSession {
  private controller = new AbortController();
  private pending: Workspace | null = null;
  private saving = false;
  private resetting = false;
  private failedReset: { snapshot: Workspace; onSaved: () => void } | null =
    null;
  writable = false;

  constructor(
    readonly source: WorkspaceDataSource,
    private onError: (message: string, cause?: unknown) => void,
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
        this.failedReset = null;
        this.pending = null;
        this.writable = true;
        onSaved();
        this.drain();
      },
      (cause) => {
        this.resetting = false;
        this.writable = false;
        this.pending = null;
        this.failedReset = { snapshot, onSaved };
        if (this.source.owner.kind === "guest")
          this.onError("Storage is still unavailable. Reset was not saved.");
        else
          this.onError(
            "Storage is still unavailable. Reset was not confirmed.",
            cause,
          );
      },
    );
  }

  retry(snapshot: Workspace, onSaved: () => void) {
    if (!this.active || this.saving || this.resetting) return;
    if (this.failedReset) {
      const failed = this.failedReset;
      this.reset(failed.snapshot, () => {
        failed.onSaved();
        onSaved();
      });
      return;
    }
    this.saving = true;
    this.perform(
      () => this.source.save(snapshot, this.controller.signal),
      () => {
        this.saving = false;
        this.writable = true;
        onSaved();
        this.drain();
      },
      (cause) => {
        this.saving = false;
        this.writable = false;
        this.onError(
          "The save could not be confirmed. Your local edits have been kept.",
          cause,
        );
      },
    );
  }

  async exclusive<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    allowPaused = false,
  ): Promise<T> {
    if (!this.active || (!this.writable && !allowPaused))
      throw new Error("Resolve the storage error before importing.");
    this.writable = false;
    this.pending = null;
    const result = await serialized(this.source, this.controller.signal, () =>
      operation(this.controller.signal),
    );
    this.controller.signal.throwIfAborted();
    this.failedReset = null;
    this.writable = true;
    return result;
  }

  async inspect<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const result = await serialized(this.source, this.controller.signal, () =>
      operation(this.controller.signal),
    );
    this.controller.signal.throwIfAborted();
    return result;
  }

  resume() {
    if (!this.active) return;
    this.writable = true;
    this.drain();
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
      (cause) => {
        this.saving = false;
        this.writable = false;
        this.pending = null;
        if (this.source.owner.kind === "guest")
          this.onError(
            "Your browser could not save changes. Your current work is still available in this session.",
          );
        else
          this.onError(
            "Your account save could not be confirmed. Your local edits have been kept.",
            cause,
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
