"use client";

import { Columns3, MoreHorizontal, Pencil, Plus, Rows3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useWorkspaceController } from "@/contexts/workspace-controller";
import { formatDate } from "@/lib/tasks/dates";

export function WorkspaceHeader() {
  const {
    title,
    tags,
    description,
    selectedEntity,
    view,
    hasLayout,
    layout,
    act,
    sectioned,
    projectId,
    create,
    setEntity,
    setSectionDialog,
    today,
    visible,
    completedToday,
    todayTotal,
  } = useWorkspaceController();

  return (
    <header className="mb-3 max-h-[35dvh] shrink-0 overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          {selectedEntity && (
            <span
              className="size-4 shrink-0 rounded-full [background:var(--entity-color,var(--primary))]"
              data-color={selectedEntity.color}
            />
          )}
          <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere">
            {title}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hasLayout && (
            <ToggleGroup
              aria-label="Task view"
              value={[layout]}
              variant="outline"
              onValueChange={(values) => {
                if (!values[0]) return;
                const next = values[0] as "list" | "board";
                act(
                  sectioned
                    ? { type: "layout", projectId, layout: next }
                    : { type: "viewLayout", view, layout: next },
                );
              }}
            >
              <ToggleGroupItem value="list">
                <Rows3 data-icon="inline-start" aria-hidden="true" />
                List
              </ToggleGroupItem>
              <ToggleGroupItem value="board">
                <Columns3 data-icon="inline-start" aria-hidden="true" />
                Kanban
              </ToggleGroupItem>
            </ToggleGroup>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Page actions"
                />
              }
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => create()}>
                  <Plus />
                  Add task
                </DropdownMenuItem>
                {sectioned && (
                  <DropdownMenuItem onClick={() => setSectionDialog({})}>
                    <Plus />
                    Add section
                  </DropdownMenuItem>
                )}
                {selectedEntity && (
                  <DropdownMenuItem
                    onClick={() =>
                      setEntity(
                        view === "tags"
                          ? {
                              kind: "tags",
                              entity: tags.byId.get(selectedEntity.id),
                            }
                          : { kind: "projects", entity: selectedEntity },
                      )
                    }
                  >
                    <Pencil />
                    Edit {view === "projects" ? "project" : "tag"}
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
        {selectedEntity && view === "tags"
          ? `${tags.path(selectedEntity.id)}${tags.children.get(selectedEntity.id)?.length ? " · Includes subtags" : ""}`
          : selectedEntity
            ? "One step at a time. Keep things moving."
            : description}
      </p>
      {view === "today" && (
        <div className="text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          <span>
            {formatDate(today, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </span>
          <span>
            {visible.filter((task) => !task.completed).length} open tasks
          </span>
          <span>
            {completedToday} of {todayTotal} done today
          </span>
        </div>
      )}
    </header>
  );
}
