// Share a lane across provider lifetimes for each immutable, owner-bound adapter.
// Composition must retain the same adapter instance when returning to an owner.
const lanes = new WeakMap<object, Promise<unknown>>();

export function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return value !== null && typeof value === "object" && "then" in value;
}

export function serialized<T>(
  source: object,
  signal: AbortSignal,
  operation: () => T | Promise<T>,
): T | Promise<T> {
  const invoke = () => {
    signal.throwIfAborted();
    return operation();
  };
  const previous = lanes.get(source);
  const result = previous ? previous.then(invoke) : invoke();
  if (isPromise(result)) {
    // Rejections must not poison the lane or become unhandled on cleanup.
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    lanes.set(source, settled);
    void settled.then(() => {
      if (lanes.get(source) === settled) lanes.delete(source);
    });
  }
  return result;
}
