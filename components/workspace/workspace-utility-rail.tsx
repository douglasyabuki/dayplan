"use client";

import {
  CircleHelp,
  LogIn,
  LogOut,
  Monitor,
  Moon,
  Search,
  Settings,
  Sun,
  UserRoundPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { AccountAvatar } from "@/components/account/account-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { workspaceHref } from "@/lib/workspace/routes";
import { useAccount } from "@/stores/account/provider";
import { useSession, useSessionActions } from "@/stores/session/provider";
import { useWorkspace } from "@/stores/workspace/provider";
import type { SettingsPanel } from "@/types-and-constants/settings";

import { WorkspaceSyncControl } from "./workspace-sync-control";

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
  const [destination, setDestination] = useState("/today");
  const ThemeIcon =
    state.theme === "dark" ? Moon : state.theme === "light" ? Sun : Monitor;
  return (
    <nav
      className="border-border bg-background flex w-14 shrink-0 basis-14 flex-col items-center gap-4 border-r px-0 pt-6 pb-4"
      aria-label="Workspace controls"
    >
      <DropdownMenu
        onOpenChange={(open) => {
          if (open)
            setDestination(
              window.location.pathname +
                window.location.search +
                window.location.hash,
            );
        }}
      >
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
            <DropdownMenuItem render={<Link href="/help" onClick={close} />}>
              <CircleHelp aria-hidden="true" />
              Help and contact
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {session.status === "authenticated" ? (
              <DropdownMenuItem
                disabled={!sessionActions || sessionActions.busy}
                onClick={() => {
                  void sessionActions?.signOut(() =>
                    router.replace("/welcome"),
                  );
                }}
              >
                <LogOut aria-hidden="true" />
                Sign out
              </DropdownMenuItem>
            ) : session.status === "guest" ? (
              <>
                <DropdownMenuItem
                  render={
                    <Link
                      href={`/sign-in?next=${encodeURIComponent(destination)}`}
                      onClick={close}
                    />
                  }
                >
                  <LogIn aria-hidden="true" />
                  Sign in
                </DropdownMenuItem>
                <DropdownMenuItem
                  render={
                    <Link
                      href={`/sign-up?next=${encodeURIComponent(destination)}`}
                      onClick={close}
                    />
                  }
                >
                  <UserRoundPlus aria-hidden="true" />
                  Sign up
                </DropdownMenuItem>
              </>
            ) : null}
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
      <WorkspaceSyncControl
        openData={(trigger) => {
          settings("data", trigger);
          close?.();
        }}
      />
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
