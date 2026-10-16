import { isPromise, serialized } from "@/stores/persistence/queue";
import { readDeletion } from "@/stores/session/deletion-state";
import type { Workspace } from "@/types-and-constants/workspace";

import { bounded } from "./coordination";
import type { WorkspaceDataSource } from "./data-source";

/** One provider lifetime. All completions and queued work are cancellation guarded. */
export class WorkspacePersistenceSession {
  private controller = new AbortController();
  private pending: Workspace | null = null;
  private saving = false;
  private firstEditAt: number | null = null;
  private lastEditAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<unknown> = Promise.resolve();
  private staging: Promise<void> = Promise.resolve();
  private flushing = false;
  private resetting = false;
  private failure: unknown = null;
  private loadedSuccessfully = false;
  private failedReset: { snapshot: Workspace; onSaved: () => void } | null =
    null;
  writable = false;

  constructor(
    readonly source: WorkspaceDataSource,
    private onError: (message: string, cause?: unknown) => void,
    private onChange: () => void = () => {},
  ) {}

  get status() {
    return {
      pending: !!this.pending,
      saving: this.saving || this.flushing || this.resetting,
    };
  }

  get active() {
    return (
      !this.controller.signal.aborted &&
      !(
        this.source.owner.kind === "account" &&
        readDeletion(this.source.owner.userId)
      )
    );
  }

  close() {
    this.cancelTimer();
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
        this.loadedSuccessfully = true;
        this.failure = null;
        this.writable = true;
        onLoad(snapshot);
      },
      (cause) => {
        this.failure = cause;
        this.loadedSuccessfully = false;
        onFailure(cause);
      },
    );
  }

  saveLatest(snapshot: Workspace) {
    if (!this.active) return;
    // Journal edits even while a network/conflict error has paused sending.
    if (this.source.stage) {
      const staged = this.source.stage(snapshot, this.controller.signal);
      this.staging = staged;
      void staged.then(
        () => {
          if (this.staging !== staged) return;
          if (!this.cancelSaved(snapshot)) this.schedule();
        },
        (cause) => {
          if (this.active) {
            this.writable = false;
            this.onChange();
            this.onError("Saving needs coordination. Retry safely.", cause);
          }
        },
      );
    }
    if (this.pending === snapshot) return;
    this.pending = snapshot;
    if (!this.source.stage && this.cancelSaved(snapshot)) return;
    if (this.firstEditAt === null) this.firstEditAt = Date.now();
    this.lastEditAt = Date.now();
    this.schedule();
  }

  private cancelSaved(snapshot: Workspace): boolean {
    // Staged data must be durable first. In-flight writes still need a
    // follow-up snapshot, since they may replace the confirmed baseline.
    if (
      this.active &&
      this.pending === snapshot &&
      this.source.isSaved?.(snapshot) &&
      !this.source.immediateSaving &&
      !this.saving &&
      !this.resetting &&
      !this.flushing
    ) {
      this.pending = null;
      this.firstEditAt = null;
      this.cancelTimer();
      this.onChange();
      return true;
    }
    return false;
  }

  private cancelTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private dueAt() {
    return this.source.owner.kind === "guest" || this.source.immediateSaving
      ? 0
      : Math.min(
          this.lastEditAt + 10000,
          (this.firstEditAt ?? Date.now()) + 60000,
        );
  }

  private schedule() {
    if (this.active) this.onChange();
    this.cancelTimer();
    if (
      !this.active ||
      !this.writable ||
      !this.pending ||
      this.saving ||
      this.resetting ||
      this.flushing
    )
      return;
    const remaining = this.dueAt() - Date.now();
    if (remaining <= 0) this.drain();
    else
      this.timer = setTimeout(() => {
        this.timer = null;
        this.drain();
      }, remaining);
  }

  /** Flush only under the caller's deadline; canceled queued work cannot send later. */
  async flush(deadline: number): Promise<void> {
    this.cancelTimer();
    this.flushing = true;
    this.onChange();
    try {
      await bounded(this.controller.signal, deadline, async (signal) => {
        await this.staging;
        signal.throwIfAborted();
        if (!this.loadedSuccessfully)
          throw this.failure ?? new Error("Account recovery has not loaded.");
        try {
          await this.inFlight;
        } catch {
          /* Reconcile ambiguous saves below. */
        }
        const code = (this.failure as { code?: string } | null)?.code;
        if (code === "revision_conflict" || code === "operation_mismatch")
          throw this.failure;
        signal.throwIfAborted();
        if (this.failedReset) throw new Error("Reset is not confirmed.");
        if (this.pending) {
          const snapshot = this.pending;
          await serialized(this.source, signal, () =>
            this.source.save(snapshot, signal),
          );
          signal.throwIfAborted();
          if (this.pending === snapshot) {
            this.pending = null;
            this.firstEditAt = null;
          }
        }
      });
      this.failure = null;
      this.writable = true;
    } catch (cause) {
      this.failure = cause;
      this.writable = false;
      if (this.active)
        this.onError("Saving could not be confirmed. Retry safely.", cause);
      throw cause;
    } finally {
      this.flushing = false;
      this.schedule();
    }
  }

  reset(snapshot: Workspace, onSaved: () => void) {
    if (!this.active || this.resetting) return;
    this.resetting = true;
    this.cancelTimer();
    this.firstEditAt = null;
    this.pending = null;
    this.perform(
      () => this.source.save(snapshot, this.controller.signal),
      () => {
        this.resetting = false;
        this.failedReset = null;
        this.pending = null;
        this.failure = null;
        this.writable = true;
        onSaved();
        this.schedule();
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
    this.cancelTimer();
    this.firstEditAt = null;
    this.pending = null;
    this.perform(
      () => this.source.save(snapshot, this.controller.signal),
      () => {
        this.saving = false;
        this.failure = null;
        this.writable = true;
        onSaved();
        this.schedule();
      },
      (cause) => {
        this.saving = false;
        this.writable = false;
        this.failure = cause;
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
    this.cancelTimer();
    this.firstEditAt = null;
    this.pending = null;
    const result = await serialized(this.source, this.controller.signal, () =>
      operation(this.controller.signal),
    );
    this.controller.signal.throwIfAborted();
    this.failedReset = null;
    this.failure = null;
    this.loadedSuccessfully = true;
    this.writable = true;
    return result;
  }

  async inspect<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    deadline?: number,
  ): Promise<T> {
    if (deadline !== undefined)
      return bounded(
        this.controller.signal,
        deadline,
        async (signal) =>
          await serialized(this.source, signal, () => operation(signal)),
      );
    const result = await serialized(this.source, this.controller.signal, () =>
      operation(this.controller.signal),
    );
    this.controller.signal.throwIfAborted();
    return result;
  }

  resume() {
    if (!this.active || this.failure) return;
    this.writable = true;
    this.schedule();
  }

  private drain() {
    if (
      !this.active ||
      !this.writable ||
      this.saving ||
      this.resetting ||
      this.flushing ||
      !this.pending
    )
      return;
    const snapshot = this.pending;
    this.pending = null;
    this.firstEditAt = null;
    this.cancelTimer();
    this.saving = true;
    this.perform(
      () => this.source.save(snapshot, this.controller.signal),
      () => {
        this.saving = false;
        this.failure = null;
        this.schedule();
      },
      (cause) => {
        this.saving = false;
        this.writable = false;
        this.failure = cause;
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
    this.onChange();
    const resolve = (result: T) => {
      if (this.active) {
        success(result);
        this.onChange();
      }
    };
    const reject = (cause: unknown) => {
      if (this.active) {
        failure(cause);
        this.onChange();
      }
    };
    try {
      const result = serialized(this.source, this.controller.signal, operation);
      if (isPromise(result)) {
        this.inFlight = result;
        void result.then(resolve, reject);
      } else resolve(result);
    } catch (cause) {
      reject(cause);
    }
  }
}
