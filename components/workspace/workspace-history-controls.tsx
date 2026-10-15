"use client";

import { Redo2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/stores/workspace/provider";

export function WorkspaceHistoryControls() {
  const { undo, redo, canUndo, canRedo } = useWorkspace();
  return (
    <div
      className="flex shrink-0 items-center gap-1"
      role="group"
      aria-label="Edit history"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Undo"
        title="Undo (Ctrl/Cmd+Z)"
        disabled={!canUndo}
        onClick={undo}
      >
        <Undo2 />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Redo"
        title="Redo (Ctrl/Cmd+Shift+Z)"
        disabled={!canRedo}
        onClick={redo}
      >
        <Redo2 />
      </Button>
    </div>
  );
}
