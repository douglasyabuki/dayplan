import { type ReactNode, Suspense } from "react";

import { WorkspaceAccess } from "@/components/workspace/workspace-access";
import { WorkspaceLoading } from "@/components/workspace/workspace-loading";
import { WorkspaceOwnerBoundary } from "@/components/workspace/workspace-owner";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <WorkspaceAccess>
        <WorkspaceOwnerBoundary>
          <WorkspaceShell>{children}</WorkspaceShell>
        </WorkspaceOwnerBoundary>
      </WorkspaceAccess>
    </Suspense>
  );
}
