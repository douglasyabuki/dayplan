"use client";

import {
  Check,
  Clock,
  CloudOff,
  LoaderCircle,
  TriangleAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWorkspace } from "@/stores/workspace/provider";

const icons = {
  Saved: Check,
  Pending: Clock,
  Saving: LoaderCircle,
  Offline: CloudOff,
  "Needs attention": TriangleAlert,
};
export function WorkspaceSyncControl({
  openData,
  showLabel = false,
  announce = true,
}: {
  openData: (trigger: HTMLElement) => void;
  showLabel?: boolean;
  announce?: boolean;
}) {
  const {
    persistenceKind,
    syncStatus,
    syncAvailable,
    syncNow,
    error,
    recoveryStorageError,
    saveFeedback,
  } = useWorkspace();
  if (persistenceKind !== "database" && !showLabel) return null;
  const Icon = icons[syncStatus];
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size={showLabel ? "sm" : "icon"}
                  aria-label={`Workspace sync: ${syncStatus}`}
                />
              }
            />
          }
        >
          <Icon
            aria-hidden="true"
            className={
              syncStatus === "Saving" ? "motion-safe:animate-spin" : undefined
            }
          />
          {showLabel && <span>{saveFeedback.label}</span>}
        </TooltipTrigger>
        <TooltipContent side="right">{syncStatus}</TooltipContent>
      </Tooltip>
      {announce && (
        <span role="status" aria-live="polite" className="sr-only">
          Workspace save: {saveFeedback.label}
        </span>
      )}
      <PopoverContent
        side={showLabel ? "bottom" : "right"}
        align="end"
        sideOffset={8}
      >
        <PopoverHeader>
          <PopoverTitle>{saveFeedback.label}</PopoverTitle>
          <PopoverDescription>
            {recoveryStorageError || error || saveFeedback.description}
          </PopoverDescription>
        </PopoverHeader>
        {persistenceKind === "database" && (
          <Button disabled={!syncAvailable} onClick={() => void syncNow()}>
            Sync now
          </Button>
        )}
        {syncStatus === "Needs attention" && (
          <Button
            variant="outline"
            onClick={(event) => openData(event.currentTarget)}
          >
            Open Data settings
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
