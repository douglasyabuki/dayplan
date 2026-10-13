"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import { workspaceQueryHref } from "@/lib/workspace/routes";

export function WorkspaceSearchInput({ query }: { query: string }) {
  const [draft, setDraft] = useState({ query, value: query });

  // Restore the field when navigation changes the search query.
  if (draft.query !== query) setDraft({ query, value: query });

  const debouncedQuery = useDebounce(draft.value);

  useEffect(() => {
    // Ignore a previously settled value while typing or restoring a URL query.
    if (debouncedQuery !== draft.value || debouncedQuery === query) return;
    const { pathname, search, hash } = window.location;
    if (pathname !== "/search") return;
    // Results are computed locally. Sync Next's search params without an RSC request.
    window.history.replaceState(
      null,
      "",
      workspaceQueryHref(pathname, new URLSearchParams(search), {
        q: debouncedQuery,
      }) + hash,
    );
  }, [debouncedQuery, draft.value, query]);

  return (
    <Input
      aria-label="Search all tasks"
      autoFocus
      placeholder="Search tasks, notes, projects, and tags…"
      value={draft.value}
      onChange={(event) => setDraft({ query, value: event.target.value })}
    />
  );
}
