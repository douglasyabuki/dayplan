import { DayplanLoading } from "@/components/shared/dayplan-loading";

import { WorkspaceFooter } from "./workspace-footer";

export function WorkspaceContentLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pt-5 sm:px-9 lg:px-14">
      <DayplanLoading
        message="Preparing your view…"
        className="min-h-0 flex-1"
      />
      <WorkspaceFooter />
    </div>
  );
}
