"use client";

import { Check, X } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useWorkspace } from "@/contexts/workspace";

export function WorkspaceFeedback() {
  const {
    error,
    notice,
    confirmation,
    reset,
    undo,
    dismissNotice,
    cancelConfirmation,
    acceptConfirmation,
  } = useWorkspace();

  return (
    <>
      {error && (
        <Alert
          variant="destructive"
          className="fixed right-4 bottom-20 z-60 max-w-md shadow-lg"
        >
          <AlertTitle>Local storage needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => location.reload()}>
              Retry loading
            </Button>
            <Button variant="outline" onClick={reset}>
              Reset saved data
            </Button>
          </div>
        </Alert>
      )}
      {notice && (
        <div
          className="bg-popover fixed bottom-6 left-1/2 z-60 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border px-4 py-2 text-xs shadow-lg [&>span]:min-w-0"
          role="status"
        >
          <Check className="text-primary size-4" />
          <span>{notice.message}</span>
          <Button variant="ghost" onClick={undo}>
            Undo
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss notification"
            onClick={dismissNotice}
          >
            <X />
          </Button>
        </div>
      )}
      <Dialog
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open) cancelConfirmation();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmation?.title}</DialogTitle>
            <DialogDescription>{confirmation?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelConfirmation}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={acceptConfirmation}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
