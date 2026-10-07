"use client";

import { useDroppable } from "@dnd-kit/react";
import {
  Archive,
  CalendarDays,
  CheckCheck,
  Folder,
  Hash,
  Inbox,
  Layers3,
  MoreHorizontal,
  Plus,
  Sun,
  Sunrise,
} from "lucide-react";
import Link from "next/link";
import { useId } from "react";

import { Button } from "@/components/ui/button";
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
import { useWorkspace } from "@/contexts/workspace";
import { useWorkspaceController } from "@/contexts/workspace-controller";
import { workspaceHref, type WorkspaceViewName } from "@/lib/tasks/routes";
import type { Occurrence, Project } from "@/lib/tasks/types";
import { cn } from "@/lib/utils";

import { WorkspaceUtilityRail } from "./workspace-utility-rail";

export function WorkspaceSidebar({
  view,
  selectedId,
  tasks,
  close,
  add,
  manage,
}: {
  view: WorkspaceViewName;
  selectedId?: string;
  tasks: Occurrence[];
  close?: () => void;
  add: () => void;
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
          <SidebarHeader className="p-0">
            <Link
              href={workspaceHref({ view: "today" })}
              className="flex items-center gap-2 px-6 pt-7 pb-8 text-xl font-semibold tracking-tight"
              onClick={close}
            >
              <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-xl">
                <Sunrise className="size-5" />
              </span>
              Dayplan<span className="text-primary -ml-2">.</span>
            </Link>
          </SidebarHeader>

          <SidebarContent className="gap-0 overflow-x-hidden pb-3">
            <SidebarGroup className="px-4 py-0">
              <Button
                className="w-full justify-start"
                size="lg"
                onClick={() => {
                  close?.();
                  add();
                }}
              >
                <Plus data-icon="inline-start" />
                Add task<span className="ml-auto text-xs opacity-60">N</span>
              </Button>
            </SidebarGroup>

            <SidebarGroup className="px-3 pt-5 pb-5">
              <SidebarGroupContent>
                <SidebarMenu>
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

            <SidebarSeparator className="mx-5 w-auto" />

            <SidebarGroup className="px-3 pt-5">
              <SidebarGroupLabel
                render={
                  <Link
                    href={workspaceHref({ view: "projects" })}
                    onClick={close}
                  />
                }
                className="mb-2 h-auto min-w-0 px-3 text-[11px] font-medium tracking-wide"
              >
                Projects
              </SidebarGroupLabel>
              <SidebarGroupAction
                aria-label="Create project"
                title="Create project"
                onClick={() => manage("projects")}
              >
                <Plus />
              </SidebarGroupAction>
              <SidebarGroupContent>
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
                            isActive={
                              view === "projects" && selectedId === project.id
                            }
                            className="min-h-9 rounded-lg px-3 pr-9 text-[13px]"
                          >
                            <Folder
                              className="size-4 shrink-0 text-(--entity-color)"
                              data-color={project.color}
                            />
                            <span>{project.name}</span>
                          </SidebarMenuButton>
                          <SidebarMenuBadge className="right-9 text-[11px]">
                            {open.filter((t) => t.projectId === project.id)
                              .length || ""}
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
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup className="px-3 pt-5">
              <SidebarGroupLabel
                render={
                  <Link
                    href={workspaceHref({ view: "tags" })}
                    onClick={close}
                  />
                }
                className="mb-2 h-auto min-w-0 px-3 text-[11px] font-medium tracking-wide"
              >
                Tags
              </SidebarGroupLabel>
              <SidebarGroupAction
                aria-label="Create tag"
                title="Create tag"
                onClick={() => manage("tags")}
              >
                <Plus />
              </SidebarGroupAction>
              <SidebarGroupContent>
                <SidebarMenu>
                  {state.tags.map((tag) => (
                    <SidebarMenuItem key={tag.id}>
                      <div className="nav-entity group relative">
                        <SidebarMenuButton
                          render={
                            <Link
                              href={workspaceHref({
                                view: "tags",
                                selectedId: tag.id,
                              })}
                              onClick={close}
                            />
                          }
                          isActive={view === "tags" && selectedId === tag.id}
                          className="min-h-9 rounded-lg px-3 pr-9 text-[13px]"
                        >
                          <Hash
                            className="tag-icon text-(--entity-color) opacity-75"
                            data-color={tag.color}
                          />
                          <span>{tag.name}</span>
                        </SidebarMenuButton>
                        <SidebarMenuAction
                          showOnHover
                          aria-label={`Edit ${tag.name}`}
                          title={`Edit ${tag.name}`}
                          onClick={() => manage("tags", tag)}
                        >
                          <MoreHorizontal />
                        </SidebarMenuAction>
                      </div>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="mt-auto px-3 pt-8 pb-0">
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
