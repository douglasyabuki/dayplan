"use client";

import { useCallback, useEffect, useState } from "react";

import type { AuthProvider } from "@/types-and-constants/auth";

/**
 * Loads public provider availability with retry and unmount-safe updates.
 * @returns {{ options: Record<AuthProvider, boolean> | null; error: boolean; retry: () => void }} Provider flags, failure state, and a reload action.
 * @example const { options, error, retry } = useAuthOptions();
 */
export function useAuthOptions() {
  const [options, setOptions] = useState<Record<AuthProvider, boolean> | null>(
    null,
  );
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setError(false);
    setOptions(null);
    setAttempt((value) => value + 1);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/auth-options", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (
          typeof data.google !== "boolean" ||
          (data.github !== undefined && typeof data.github !== "boolean")
        )
          throw new Error();
        if (!controller.signal.aborted)
          setOptions({ google: data.google, github: data.github === true });
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    })();
    return () => controller.abort();
  }, [attempt]);
  return { options, error, retry };
}
