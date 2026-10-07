import { Skeleton } from "@/components/ui/skeleton";

import { WorkspaceFooter } from "./workspace-footer";

export function WorkspaceContentLoading() {
  return (
    <div
      role="status"
      aria-label="Loading workspace view"
      className="flex min-h-0 flex-1 flex-col px-5 pt-5 sm:px-9 lg:px-14"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
      <WorkspaceFooter />
    </div>
  );
}
