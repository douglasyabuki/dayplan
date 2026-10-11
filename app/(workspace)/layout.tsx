import type { ReactNode } from "react";

import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { AccountProvider } from "@/stores/account/provider";
import { WorkspaceProvider } from "@/stores/workspace/provider";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <AccountProvider>
      <WorkspaceProvider>
        <WorkspaceShell>{children}</WorkspaceShell>
      </WorkspaceProvider>
    </AccountProvider>
  );
}
