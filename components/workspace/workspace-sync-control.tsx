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
const descriptions = {
  Saved:
    "Your workspace edits are saved. Sync now to check for remote changes.",
  Pending: "Local edits are waiting to be saved.",
  Saving:
    "Saving edits and checking for remote changes. Workspace changes are briefly paused during sync.",
  Offline:
    "Sync could not reach account storage. Your local edits have been kept.",
  "Needs attention": "Resolve the storage or recovery issue before syncing.",
};

export function WorkspaceSyncControl({
  openData,
}: {
  openData: (trigger: HTMLElement) => void;
}) {
  const {
    persistenceKind,
    syncStatus,
    syncAvailable,
    syncNow,
    error,
    recoveryStorageError,
  } = useWorkspace();
  if (persistenceKind !== "database") return null;
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
                  size="icon"
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
        </TooltipTrigger>
        <TooltipContent side="right">{syncStatus}</TooltipContent>
      </Tooltip>
      <span role="status" aria-live="polite" className="sr-only">
        Workspace sync: {syncStatus}
      </span>
      <PopoverContent side="right" align="start" sideOffset={8}>
        <PopoverHeader>
          <PopoverTitle>{syncStatus}</PopoverTitle>
          <PopoverDescription>
            {error || recoveryStorageError || descriptions[syncStatus]}
          </PopoverDescription>
        </PopoverHeader>
        <Button disabled={!syncAvailable} onClick={() => void syncNow()}>
          Sync now
        </Button>
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
