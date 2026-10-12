"use client";

import { LogOut, Monitor, Moon, Search, Settings, Sun } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";

import { AccountAvatar } from "@/components/account/account-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { workspaceHref } from "@/lib/workspace/routes";
import { useAccount } from "@/stores/account/provider";
import { useSession, useSessionActions } from "@/stores/session/provider";
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
  const session = useSession();
  const sessionActions = useSessionActions();
  const router = useRouter();
  const accountTrigger = useRef<HTMLButtonElement>(null);
  const ThemeIcon =
    state.theme === "dark" ? Moon : state.theme === "light" ? Sun : Monitor;
  return (
    <nav
      className="border-border bg-background flex w-14 shrink-0 basis-14 flex-col items-center gap-4 border-r px-0 pt-6 pb-4"
      aria-label="Workspace controls"
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          ref={accountTrigger}
          render={<Button variant="ghost" size="icon" />}
          aria-label={`Account and workspace settings for ${profile.name}`}
          title="Account menu"
        >
          <AccountAvatar />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="right"
          align="start"
          sideOffset={8}
          className="min-w-44"
        >
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => {
                if (accountTrigger.current)
                  settings("account", accountTrigger.current);
                close?.();
              }}
            >
              <Settings aria-hidden="true" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={sessionActions?.busy}
              onClick={() => {
                if (session.status === "authenticated") {
                  void sessionActions?.signOut(() =>
                    router.replace("/welcome"),
                  );
                } else {
                  router.replace("/welcome");
                  close?.();
                }
              }}
            >
              <LogOut aria-hidden="true" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
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
