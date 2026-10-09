"use client";

import { DragDropProvider } from "@dnd-kit/react";
import type { CSSProperties, ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { WorkspaceSidebar } from "@/components/workspace/workspace-sidebar";
import { WorkspaceUtilityRail } from "@/components/workspace/workspace-utility-rail";
import {
  useWorkspaceController,
  WorkspaceController,
} from "@/contexts/workspace-controller";
import { useWorkspace } from "@/stores/workspace/provider";

import { WorkspaceFeedback } from "./workspace-feedback";
import { WorkspaceLoading } from "./workspace-loading";
import { WorkspaceOverlays } from "./workspace-overlays";

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const { ready } = useWorkspace();
  if (!ready) return <WorkspaceLoading />;
  return (
    <WorkspaceController>
      <WorkspaceLayout>{children}</WorkspaceLayout>
    </WorkspaceController>
  );
}

function WorkspaceLayout({ children }: { children: ReactNode }) {
  const { setSettings } = useWorkspaceController();
  return (
    <div className="flex h-dvh overflow-hidden">
      <div className="hidden shrink-0 md:flex">
        <WorkspaceUtilityRail settings={() => setSettings(true)} />
      </div>
      <SidebarProvider
        className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
        style={
          {
            "--sidebar-width": "17rem",
          } as CSSProperties
        }
      >
        <WorkspaceFrame>{children}</WorkspaceFrame>
      </SidebarProvider>
    </div>
  );
}

function WorkspaceFrame({ children }: { children: ReactNode }) {
  const { open, openMobile, isMobile, setOpenMobile } = useSidebar();
  const sidebarOpen = isMobile ? openMobile : open;
  const sidebarLabel = sidebarOpen ? "Collapse sidebar" : "Expand sidebar";
  const { storageError, title, dragEnd, dragStart, dragMove, sidebarProps } =
    useWorkspaceController();
  return (
    <DragDropProvider
      onDragStart={dragStart}
      onDragMove={dragMove}
      onDragOver={dragMove}
      onDragEnd={dragEnd}
    >
      <WorkspaceSidebar {...sidebarProps} close={() => setOpenMobile(false)} />
      <SidebarInset className="min-h-0 min-w-0">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b px-5 text-xs md:px-9">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger
              size="icon"
              className="-ml-3 md:-ml-5"
              aria-label={sidebarLabel}
              title={sidebarLabel}
              aria-expanded={sidebarOpen}
            />
            <Breadcrumb className="min-w-0">
              <BreadcrumbList className="flex-nowrap gap-2 text-xs">
                <BreadcrumbItem className="hidden sm:inline-flex">
                  My workspace
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden sm:block [&>svg]:size-3" />
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage className="truncate">{title}</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
          <Badge
            variant="secondary"
            className="text-muted-foreground hidden items-center gap-2 text-[10px] sm:inline-flex"
          >
            <span className="size-1.5 rounded-full bg-(--emerald)" />
            {storageError
              ? "Session only · storage unavailable"
              : "Saved locally"}
          </Badge>
        </header>
        {children}
      </SidebarInset>
      <WorkspaceFeedback />
      <WorkspaceOverlays />
    </DragDropProvider>
  );
}
