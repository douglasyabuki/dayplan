export class CoordinationError extends Error {
  readonly code = "coordination_error";
  constructor() {
    super(
      "Another tab is busy or coordination is unavailable. Your edits have been kept. Retry saving.",
    );
  }
}

export class DeadlineError extends Error {
  readonly code = "network_error";
  constructor() {
    super("Saving timed out. The outcome may be unknown; retry safely.");
  }
}

/** Runs bounded work without allowing a canceled callback to start later. */
export async function bounded<T>(
  signal: AbortSignal,
  deadline: number,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  if (Date.now() >= deadline) throw new DeadlineError();
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new DeadlineError()),
    Math.max(0, deadline - Date.now()),
  );
  try {
    return await Promise.race([
      Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return operation(controller.signal);
      }),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => reject(controller.signal.reason),
          { once: true },
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

/** Acquires one lock with a bounded wait; never steals an existing lock. */
async function lock<T>(
  name: string,
  signal: AbortSignal,
  deadline: number,
  operation: () => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  if (typeof navigator === "undefined" || !navigator.locks)
    throw new CoordinationError();
  const waiting = new AbortController();
  const abort = () => waiting.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(
    () => waiting.abort(new CoordinationError()),
    Math.max(0, Math.min(2000, deadline - Date.now())),
  );
  try {
    return await navigator.locks.request(
      name,
      { signal: waiting.signal },
      async () => {
        clearTimeout(timer);
        signal.throwIfAborted();
        if (Date.now() >= deadline) throw new CoordinationError();
        return operation();
      },
    );
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (waiting.signal.aborted) throw new CoordinationError();
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

/** Account network work may contain short journal critical sections. */
export function accountCoordinated<T>(
  userId: string,
  signal: AbortSignal,
  deadline: number,
  operation: () => Promise<T>,
): Promise<T> {
  return lock(`dayplan:account:${userId}`, signal, deadline, operation);
}

/** Staging needs only the journal lock, allowing edits to persist during network I/O. */
export function journalCoordinated<T>(
  userId: string,
  writerId: string,
  signal: AbortSignal,
  deadline: number,
  operation: () => Promise<T>,
): Promise<T> {
  return lock(
    `dayplan:journal:${userId}:${writerId}`,
    signal,
    deadline,
    operation,
  );
}
