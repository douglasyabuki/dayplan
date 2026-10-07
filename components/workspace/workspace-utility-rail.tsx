"use client";

import { Monitor, Moon, Search, Sun } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useWorkspace } from "@/contexts/workspace";
import { workspaceHref } from "@/lib/tasks/routes";

import { Avatar, AvatarFallback } from "../ui/avatar";

export function WorkspaceUtilityRail({
  settings,
  close,
}: {
  settings: () => void;
  close?: () => void;
}) {
  const { state, act } = useWorkspace();
  const [appearance, setAppearance] = useState(false);
  const ThemeIcon =
    state.theme === "dark" ? Moon : state.theme === "light" ? Sun : Monitor;
  return (
    <nav
      className="border-border bg-background flex w-14 shrink-0 basis-14 flex-col items-center gap-4 border-r px-0 pt-6 pb-4"
      aria-label="Workspace controls"
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label="Account and workspace settings"
        title="My workspace"
        onClick={() => {
          close?.();
          settings();
        }}
      >
        <Avatar>
          <AvatarFallback className="bg-accent text-accent-foreground text-xs">
            Y
          </AvatarFallback>
        </Avatar>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        nativeButton={false}
        render={
          <Link href={workspaceHref({ view: "search" })} onClick={close} />
        }
        aria-label="Search tasks"
        title="Search tasks (Ctrl / ⌘ K)"
      >
        <Search />
      </Button>
      <Button
        className="mt-auto"
        variant="ghost"
        size="icon"
        aria-label={`Theme: ${state.theme}`}
        title="Choose theme"
        onClick={() => setAppearance(true)}
      >
        <ThemeIcon />
      </Button>
      <Dialog open={appearance} onOpenChange={setAppearance}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Appearance</DialogTitle>
            <DialogDescription>
              Choose a theme for your workspace.
            </DialogDescription>
          </DialogHeader>
          <ToggleGroup
            aria-label="Theme"
            value={[state.theme]}
            variant="outline"
            onValueChange={(values) => {
              if (values[0])
                act({
                  type: "theme",
                  theme: values[0] as typeof state.theme,
                });
            }}
          >
            <ToggleGroupItem value="dark">
              <Moon />
              Dark
            </ToggleGroupItem>
            <ToggleGroupItem value="light">
              <Sun />
              Light
            </ToggleGroupItem>
            <ToggleGroupItem value="system">
              <Monitor />
              System
            </ToggleGroupItem>
          </ToggleGroup>
        </DialogContent>
      </Dialog>
    </nav>
  );
}
