import { Sun } from "lucide-react";

import { Skeleton } from "../ui/skeleton";

export function WorkspaceLoading() {
  return (
    <div
      role="status"
      className="text-muted-foreground flex min-h-dvh flex-col items-center justify-center gap-5 text-sm"
    >
      <Sun className="text-primary size-9" />
      <p>Making room for your day…</p>
      <Skeleton className="h-2 w-48" />
    </div>
  );
}
