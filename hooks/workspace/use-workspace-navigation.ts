"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import {
  resolveWorkspaceRoute,
  workspaceQueryHref,
} from "@/lib/workspace/routes";

/**
 * Reads the current workspace route and provides navigation helpers for its query parameters.
 * @returns {object} An object with `router` for route navigation, `routeKey` for the current pathname and query string, `view` and `selectedId` for the resolved workspace route, `params` as a URLSearchParams snapshot, and `setParams` to push or replace query changes without scrolling.
 * @example
 * const { view, params, setParams } = useWorkspaceNavigation();
 * setParams({ filter: "open" });
 */
export function useWorkspaceNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeKey = pathname + "?" + searchParams.toString();
  const route = resolveWorkspaceRoute(pathname) ?? { view: "today" as const };
  const { view, selectedId } = route;
  const params = useMemo(
    () => new URLSearchParams(searchParams.toString()),
    [searchParams],
  );
  function setParams(changes: Record<string, string | null>, replace = false) {
    const url = workspaceQueryHref(pathname, params, changes);
    if (replace) router.replace(url, { scroll: false });
    else router.push(url, { scroll: false });
  }
  return { router, routeKey, view, selectedId, params, setParams };
}
