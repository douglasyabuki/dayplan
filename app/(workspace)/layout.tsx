import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { WorkspaceProvider } from "@/contexts/workspace";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <WorkspaceShell>{children}</WorkspaceShell>
    </WorkspaceProvider>
  );
}
