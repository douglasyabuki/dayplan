"use client";

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
import { useWorkspace } from "@/stores/workspace/provider";

export function WorkspaceFeedback() {
  const {
    error,
    operationError,
    dismissOperationError,
    confirmation,
    reset,
    cancelConfirmation,
    acceptConfirmation,
  } = useWorkspace();

  return (
    <>
      {operationError && (
        <Alert
          variant="destructive"
          className="fixed right-4 bottom-36 z-60 max-w-md shadow-lg"
        >
          <AlertTitle>Change could not be applied</AlertTitle>
          <AlertDescription>{operationError}</AlertDescription>
          <Button variant="outline" onClick={dismissOperationError}>
            Dismiss
          </Button>
        </Alert>
      )}
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
