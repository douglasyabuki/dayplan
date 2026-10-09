"use client";

import { useDroppable } from "@dnd-kit/react";
import {
  Archive,
  CalendarDays,
  CheckCheck,
  Folder,
  Inbox,
  Layers3,
  MoreHorizontal,
  Plus,
  Sun,
  Sunrise,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useId, useLayoutEffect, useRef } from "react";

import { TagTree } from "@/components/tags/tag-tree";
import {
  Sidebar as BaseSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { useWorkspaceController } from "@/contexts/workspace-controller";
import { cn } from "@/lib/utils";
import { workspaceHref, type WorkspaceViewName } from "@/lib/workspace/routes";
import { useWorkspace } from "@/stores/workspace/provider";
import type { Project } from "@/types-and-constants/projects";
import type { Occurrence } from "@/types-and-constants/tasks";

import { WorkspaceUtilityRail } from "./workspace-utility-rail";

export function WorkspaceSidebar({
  view,
  selectedId,
  tasks,
  close,
  manage,
}: {
  view: WorkspaceViewName;
  selectedId?: string;
  tasks: Occurrence[];
  close?: () => void;
  manage: (kind: "projects" | "tags", entity?: Project) => void;
}) {
  const { state, today } = useWorkspace();
  const { open: sidebarOpen, isMobile } = useSidebar();
  const { setSettings } = useWorkspaceController();
  const open = tasks.filter((t) => !t.completed && !t.archived);
  const counts: Record<string, number> = {
    today: open.filter(
      (t) =>
        t.schedule?.date === today || (t.deadline && t.deadline.date <= today),
    ).length,
    inbox: open.filter((t) => !t.projectId).length,
  };
  const nav = [
    { id: "inbox", label: "Inbox", icon: Inbox },
    { id: "today", label: "Today", icon: Sun },
    { id: "upcoming", label: "Upcoming", icon: CalendarDays },
    { id: "tasks", label: "All tasks", icon: Layers3 },
    { id: "calendar", label: "Calendar", icon: CalendarDays },
  ] as const;
  const projectMenu = (
    <SidebarMenu>
      {state.projects.map((project) => (
        <SidebarMenuItem key={project.id}>
          <ProjectTarget projectId={project.id}>
            <div className="nav-entity group relative">
              <SidebarMenuButton
                render={
                  <Link
                    href={workspaceHref({
                      view: "projects",
                      selectedId: project.id,
                    })}
                    onClick={close}
                  />
                }
                isActive={view === "projects" && selectedId === project.id}
                className="min-h-9 rounded-lg px-3 pr-9 text-[13px]"
              >
                <Folder
                  className="size-4 shrink-0 text-(--entity-color)"
                  data-color={project.color}
                />
                <span>{project.name}</span>
              </SidebarMenuButton>
              <SidebarMenuBadge className="right-9 text-[11px]">
                {open.filter((t) => t.projectId === project.id).length || ""}
              </SidebarMenuBadge>
              <SidebarMenuAction
                showOnHover
                aria-label={`Edit ${project.name}`}
                title={`Edit ${project.name}`}
                onClick={() => manage("projects", project)}
              >
                <MoreHorizontal />
              </SidebarMenuAction>
            </div>
          </ProjectTarget>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );

  return (
    <BaseSidebar
      collapsible="offcanvas"
      className="absolute h-full"
      inert={!isMobile && !sidebarOpen}
      aria-hidden={!isMobile && !sidebarOpen}
    >
      <div className="flex h-full min-h-0 min-w-0">
        {isMobile && (
          <WorkspaceUtilityRail
            settings={() => setSettings(true)}
            close={close}
          />
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <SidebarHeader className="sidebar-brand shrink-0 p-0">
            <Link
              href={workspaceHref({ view: "today" })}
              className="flex h-16 items-center gap-2 px-6 text-xl font-semibold tracking-tight"
              onClick={close}
            >
              <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-xl">
                <Sunrise className="size-5" />
              </span>
              Dayplan<span className="text-primary -ml-2">.</span>
            </Link>
          </SidebarHeader>

          <SidebarContent className="min-w-0 gap-0 overflow-x-hidden pb-3">
            <SidebarGroup className="shrink-0 px-3 pt-1 pb-3">
              <SidebarGroupContent>
                <SidebarMenu className="sidebar-primary-menu">
                  {nav.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <ProjectTarget
                        projectId={null}
                        enabled={item.id === "inbox"}
                      >
                        <SidebarMenuButton
                          render={
                            <Link
                              href={workspaceHref({ view: item.id })}
                              onClick={close}
                            />
                          }
                          isActive={view === item.id}
                          className="min-h-9 rounded-lg px-3 text-[13px]"
                        >
                          <item.icon />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                        {counts[item.id] > 0 && (
                          <SidebarMenuBadge className="right-3 text-[11px]">
                            {counts[item.id]}
                          </SidebarMenuBadge>
                        )}
                      </ProjectTarget>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarSeparator className="mx-5 shrink-0" />

            <div className="sidebar-collections flex min-h-48 flex-1 flex-col gap-2 py-2">
              <SidebarGroup className="sidebar-collection min-h-20 shrink px-3 py-0">
                <SidebarGroupLabel
                  render={
                    <Link
                      href={workspaceHref({ view: "projects" })}
                      onClick={close}
                    />
                  }
                  className="h-9 min-w-0 px-3 text-[11px] font-medium tracking-wide"
                >
                  Projects
                </SidebarGroupLabel>
                <SidebarGroupAction
                  className="top-2 right-5"
                  aria-label="Create project"
                  title="Create project"
                  onClick={() => manage("projects")}
                >
                  <Plus />
                </SidebarGroupAction>
                <CollectionList label="Projects list">
                  {projectMenu}
                  {state.projects.length === 0 && (
                    <p className="text-muted-foreground flex h-9 items-center px-3 text-xs">
                      No projects yet
                    </p>
                  )}
                </CollectionList>
              </SidebarGroup>

              <SidebarGroup className="sidebar-collection min-h-20 shrink px-3 py-0">
                <SidebarGroupLabel
                  render={
                    <Link
                      href={workspaceHref({ view: "tags" })}
                      onClick={close}
                    />
                  }
                  className="h-9 min-w-0 px-3 text-[11px] font-medium tracking-wide"
                >
                  Tags
                </SidebarGroupLabel>
                <SidebarGroupAction
                  className="top-2 right-5"
                  aria-label="Create tag"
                  title="Create tag"
                  onClick={() => manage("tags")}
                >
                  <Plus />
                </SidebarGroupAction>
                <CollectionList label="Tags list">
                  <TagTree close={close} label="Sidebar tags" />
                  {state.tags.length === 0 && (
                    <p className="text-muted-foreground flex h-9 items-center px-3 text-xs">
                      No tags yet
                    </p>
                  )}
                </CollectionList>
              </SidebarGroup>
            </div>
          </SidebarContent>
          <SidebarSeparator className="mx-5 shrink-0" />
          <SidebarFooter className="sidebar-secondary-menu shrink-0 px-3 py-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <Link
                      href={workspaceHref({ view: "completed" })}
                      onClick={close}
                    />
                  }
                  isActive={view === "completed"}
                  className="min-h-9 rounded-lg px-3 text-[13px]"
                >
                  <CheckCheck />
                  <span>Completed</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <Link
                      href={workspaceHref({ view: "archive" })}
                      onClick={close}
                    />
                  }
                  isActive={view === "archive"}
                  className="min-h-9 rounded-lg px-3 text-[13px]"
                >
                  <Archive />
                  <span>Archive</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </div>
      </div>
    </BaseSidebar>
  );
}

function CollectionList({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const allocationRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const allocation = allocationRef.current!;
    const viewport = viewportRef.current!;
    const content = contentRef.current!;
    const group = allocation.closest<HTMLElement>(".sidebar-collection")!;
    const collections = group.parentElement!;
    const resize = () => {
      // Retain the list's natural size as its flex basis, then round only the
      // visible viewport. Rounding the flex item itself would feed back into
      // its allocation and prevent it from growing again on taller windows.
      const contentHeight = content.getBoundingClientRect().height;
      allocation.style.height = `${contentHeight}px`;
      const row = content.querySelector<HTMLElement>(
        '[data-sidebar="menu-button"], [data-tag-row]',
      );
      const rowHeight = row?.getBoundingClientRect().height;
      const headingHeight = group
        .querySelector('[data-sidebar="group-label"]')!
        .getBoundingClientRect().height;
      const styles = getComputedStyle(collections);
      const sharedHeight =
        collections.clientHeight -
        parseFloat(styles.paddingTop) -
        parseFloat(styles.paddingBottom) -
        parseFloat(styles.rowGap);
      // Reserve up to four whole rows for each collection before longer lists
      // compete for the remaining space. Short windows reduce both minima.
      const minimumRows = rowHeight
        ? Math.max(
            1,
            Math.min(
              4,
              Math.floor((sharedHeight / 2 - headingHeight) / rowHeight),
            ),
          )
        : 0;
      group.style.minHeight = `${headingHeight + Math.min(contentHeight, rowHeight ? minimumRows * rowHeight : contentHeight)}px`;
      const available = allocation.getBoundingClientRect().height;
      viewport.style.height = `${rowHeight ? Math.floor((available + 0.5) / rowHeight) * rowHeight : available}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(allocation);
    observer.observe(content);
    observer.observe(collections);
    return () => observer.disconnect();
  }, []);

  return (
    <SidebarGroupContent
      ref={allocationRef}
      className="relative min-h-0 shrink"
    >
      {/* Drag previews reflow the tree; snapping must not move its hit regions. */}
      <div
        ref={viewportRef}
        role="region"
        aria-label={label}
        tabIndex={0}
        className="app-scrollbar absolute inset-x-0 top-0 snap-y snap-mandatory overflow-x-hidden overflow-y-auto has-[[data-tag-root-target]:not(:empty)]:snap-none **:data-tag-root-target:empty:h-0 **:data-tag-row:snap-start **:data-[sidebar=menu-action]:right-2 **:data-[sidebar=menu-button]:snap-start [&_ul]:gap-0"
      >
        <div ref={contentRef}>{children}</div>
      </div>
    </SidebarGroupContent>
  );
}

function ProjectTarget({
  projectId,
  enabled = true,
  children,
}: {
  projectId: string | null;
  enabled?: boolean;
  children: React.ReactNode;
}) {
  const targetId = useId();
  const { ref, isDropTarget } = useDroppable({
    id: `project:${projectId ?? "inbox"}:${targetId}`,
    accept: (source) => typeof source.data.taskId === "string",
    disabled: !enabled,
    data: { kind: "project", projectId },
  });
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-lg",
        isDropTarget &&
          "bg-accent outline-primary! outline-2! -outline-offset-2!",
      )}
    >
      {children}
    </div>
  );
}
