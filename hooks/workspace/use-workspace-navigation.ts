"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import {
  resolveWorkspaceRoute,
  workspaceQueryHref,
} from "@/lib/workspace/routes";
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
