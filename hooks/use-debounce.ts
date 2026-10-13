"use client";

import { useEffect, useState } from "react";

/**
 * Delays value updates until the value has stayed unchanged for the given delay.
 * @param value Value to debounce; compared by identity for objects and arrays.
 * @param delay Delay in milliseconds, defaulting to 300. Changing it restarts the timer.
 * @returns {T} The initial value immediately, then the latest value after the delay; the previous value is returned while an update is pending. Pending timers are cancelled on unmount.
 * @example
 * const debouncedQuery = useDebounce(query, 300);
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(() => value);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedValue(() => value),
      delay,
    );
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
