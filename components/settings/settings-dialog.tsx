"use client";

import { CircleUserRound, Database, Info, Palette } from "lucide-react";
import { type RefObject, useRef, useState } from "react";

import {
  type AccountEditHandle,
  AccountPanel,
} from "@/components/account/account-panel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { useAccount } from "@/stores/account/provider";
import { useWorkspace } from "@/stores/workspace/provider";

import type { SettingsPanel } from "../../types-and-constants/settings";
import { AboutPanel } from "./about-panel";
import { AppearancePanel } from "./appearance-panel";
import { DataPanel } from "./data-panel";

const panels = [
  { id: "account", title: "Account", icon: CircleUserRound },
  { id: "appearance", title: "Appearance", icon: Palette },
  { id: "data", title: "Data", icon: Database },
  { id: "about", title: "About", icon: Info },
] as const;

export function SettingsDialog({
  initialPanel,
  onClose,
  returnFocus,
}: {
  initialPanel: SettingsPanel;
  onClose: () => void;
  returnFocus: RefObject<HTMLElement | null>;
}) {
  const [panel, setPanel] = useState(initialPanel);
  const [open, setOpen] = useState(true);
  const edit = useRef<AccountEditHandle>(null);
  const selectedButton = useRef<HTMLButtonElement>(null);
  const composing = useRef(false);
  const resetAfterClose = useRef(false);
  const { ready } = useAccount();
  const { reset } = useWorkspace();

  function close(cancel = false) {
    if (cancel) edit.current?.cancel();
    else edit.current?.commit();
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        if (next) return;
        if (
          details.reason === "escape-key" &&
          (composing.current ||
            (details.event instanceof KeyboardEvent &&
              (details.event.isComposing || details.event.keyCode === 229)))
        ) {
          details.cancel();
          return;
        }
        close(details.reason === "escape-key");
      }}
      onOpenChangeComplete={(next) => {
        if (!next) {
          onClose();
          if (resetAfterClose.current) reset();
        }
      }}
    >
      <DialogContent
        className="flex h-[min(600px,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[760px]"
        initialFocus={selectedButton}
        finalFocus={() =>
          returnFocus.current?.isConnected &&
          returnFocus.current.getClientRects().length > 0 &&
          !returnFocus.current.closest('[role="dialog"][data-closed]')
            ? returnFocus.current
            : document.querySelector<HTMLButtonElement>(
                "[data-workspace-sidebar-trigger]",
              )
        }
        onCompositionStartCapture={() => {
          composing.current = true;
        }}
        onCompositionEndCapture={() => {
          composing.current = false;
        }}
        onKeyDownCapture={(event) => {
          if (event.key !== "Escape") return;
          if (
            composing.current ||
            event.nativeEvent.isComposing ||
            event.keyCode === 229
          ) {
            event.stopPropagation();
            return;
          }
          edit.current?.cancel();
        }}
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <DialogDescription className="sr-only">
          Manage your account, appearance, and workspace data.
        </DialogDescription>
        <SidebarProvider
          keyboardShortcut={false}
          className="min-h-0 flex-1 flex-col overflow-hidden md:flex-row"
          style={{ "--sidebar-width": "180px" } as React.CSSProperties}
        >
          <Sidebar
            collapsible="none"
            className="h-auto w-full shrink-0 border-b pt-10 md:h-full md:w-(--sidebar-width) md:border-r md:border-b-0 md:pt-4"
          >
            <SidebarContent className="overflow-visible">
              <SidebarGroup className="px-3">
                <SidebarGroupContent>
                  <nav aria-label="Settings panels">
                    <SidebarMenu className="grid grid-cols-2 gap-1 sm:flex sm:flex-row md:flex-col">
                      {panels.map(({ id, title, icon: Icon }) => (
                        <SidebarMenuItem
                          key={id}
                          className="min-w-0 flex-1 md:flex-none"
                        >
                          <SidebarMenuButton
                            ref={panel === id ? selectedButton : undefined}
                            isActive={panel === id}
                            aria-current={panel === id ? "page" : undefined}
                            aria-controls="settings-panel"
                            size="nav"
                            onClick={() => {
                              if (id === panel) return;
                              edit.current?.commit();
                              setPanel(id);
                            }}
                          >
                            <Icon aria-hidden="true" />
                            <span>{title}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                    </SidebarMenu>
                  </nav>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
          <section
            id="settings-panel"
            aria-labelledby="settings-panel-title"
            className="flex min-h-0 min-w-0 flex-1 flex-col"
          >
            <header className="shrink-0 px-5 py-5 pr-12 md:px-6 md:pr-12">
              <h2 id="settings-panel-title" className="text-base font-medium">
                {panels.find((item) => item.id === panel)?.title}
              </h2>
            </header>
            <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-6 text-sm md:px-6">
              {panel === "account" &&
                (ready ? (
                  <AccountPanel ref={edit} />
                ) : (
                  <p role="status" className="text-muted-foreground">
                    Loading account…
                  </p>
                ))}
              {panel === "appearance" && <AppearancePanel />}
              {panel === "about" && <AboutPanel />}
              {panel === "data" && (
                <DataPanel
                  onReset={() => {
                    resetAfterClose.current = true;
                    close();
                  }}
                />
              )}
            </div>
          </section>
        </SidebarProvider>
      </DialogContent>
    </Dialog>
  );
}
