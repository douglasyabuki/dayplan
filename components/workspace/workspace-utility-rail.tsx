"use client";

import { Monitor, Moon, Search, Sun } from "lucide-react";
import Link from "next/link";

import { AccountAvatar } from "@/components/account/account-avatar";
import { Button } from "@/components/ui/button";
import { workspaceHref } from "@/lib/workspace/routes";
import { useAccount } from "@/stores/account/provider";
import { useWorkspace } from "@/stores/workspace/provider";
import type { SettingsPanel } from "@/types-and-constants/settings";

export function WorkspaceUtilityRail({
  settings,
  close,
}: {
  settings: (panel: SettingsPanel, trigger: HTMLElement) => void;
  close?: () => void;
}) {
  const { state } = useWorkspace();
  const { profile } = useAccount();
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
        aria-label={`Account and workspace settings for ${profile.name}`}
        aria-haspopup="dialog"
        title="Account settings"
        onClick={(event) => {
          settings("account", event.currentTarget);
          close?.();
        }}
      >
        <AccountAvatar />
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
        aria-haspopup="dialog"
        onClick={(event) => {
          settings("appearance", event.currentTarget);
          close?.();
        }}
      >
        <ThemeIcon />
      </Button>
    </nav>
  );
}
