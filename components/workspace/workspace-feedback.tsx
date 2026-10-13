"use client";

import { useRef } from "react";

import { GuestImportPanel } from "@/components/account/guest-import-panel";
import { EditorSelect } from "@/components/tasks/controls/task-property-controls";
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
import { useSessionActions } from "@/stores/session/provider";
import { useWorkspace } from "@/stores/workspace/provider";

export function WorkspaceFeedback() {
  const cancelButton = useRef<HTMLButtonElement>(null);
  const sessionActions = useSessionActions();
  const {
    error,
    confirm,
    recoveryStorageError,
    operationError,
    dismissOperationError,
    confirmation,
    reset,
    cancelConfirmation,
    setConfirmationChoice,
    acceptConfirmation,
    persistenceKind,
    recoveryCode,
    downloadBackup,
    reloadSaved,
    retrySave,
    retryRecovery,
    busy,
    hasPendingImport,
    retryImport,
    guestCleanupError,
    hasPendingGuestCleanup,
    retryGuestCleanup,
  } = useWorkspace();

  return (
    <>
      <GuestImportPanel />
      {sessionActions?.departureBlocked && (
        <Alert variant="destructive">
          <AlertTitle>Your edits need attention before leaving</AlertTitle>
          <AlertDescription>{sessionActions.error}</AlertDescription>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={downloadBackup}>
              Download local backup
            </Button>
            <Button
              variant="outline"
              disabled={sessionActions.busy}
              onClick={() => void sessionActions.retryDeparture()}
            >
              Retry leaving
            </Button>
            <Button
              variant="destructive"
              disabled={sessionActions.busy}
              onClick={() =>
                confirm({
                  title: "Discard unconfirmed edits and leave?",
                  description:
                    "Download a backup first if you want to keep your edits. This discards this tab's pending changes.",
                  confirmLabel: "Discard edits and leave",
                  action: () => {
                    void sessionActions.discardAndLeave();
                  },
                })
              }
            >
              Discard edits and leave
            </Button>
          </div>
        </Alert>
      )}
      {recoveryStorageError && (
        <Alert variant="destructive">
          <AlertTitle>Browser recovery needs attention</AlertTitle>
          <AlertDescription>{recoveryStorageError}</AlertDescription>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={downloadBackup}>
              Download local backup
            </Button>
            <Button variant="outline" disabled={busy} onClick={retrySave}>
              Retry save and recovery
            </Button>
          </div>
        </Alert>
      )}
      {guestCleanupError && (
        <Alert variant="destructive">
          <AlertTitle>Guest data cleanup needs attention</AlertTitle>
          <AlertDescription>{guestCleanupError}</AlertDescription>
          {hasPendingGuestCleanup && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={retryGuestCleanup}
            >
              Retry cleanup
            </Button>
          )}
        </Alert>
      )}
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
      {(error || hasPendingImport) && (
        <Alert
          variant="destructive"
          className="fixed right-4 bottom-20 z-60 max-w-md shadow-lg"
        >
          <AlertTitle>
            {persistenceKind === "database"
              ? "Account storage needs attention"
              : "Local storage needs attention"}
          </AlertTitle>
          <AlertDescription>
            {error ||
              "Resolve the pending guest import before editing your account workspace."}
          </AlertDescription>
          {persistenceKind === "database" ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={downloadBackup}>
                Download local backup
              </Button>
              <Button variant="outline" disabled={busy} onClick={reloadSaved}>
                Load server version
              </Button>
              {hasPendingImport ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void retryImport()}
                >
                  Retry import
                </Button>
              ) : recoveryCode === "load_failed" ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={retryRecovery}
                >
                  Retry recovery
                </Button>
              ) : (
                recoveryCode !== "revision_conflict" &&
                recoveryCode !== "load_failed" && (
                  <Button variant="outline" disabled={busy} onClick={retrySave}>
                    Retry save
                  </Button>
                )
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => location.reload()}>
                Retry loading
              </Button>
              <Button variant="outline" onClick={reset}>
                Reset saved data
              </Button>
            </div>
          )}
        </Alert>
      )}
      <Dialog
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open) cancelConfirmation();
        }}
      >
        <DialogContent initialFocus={cancelButton}>
          <DialogHeader>
            <DialogTitle>{confirmation?.title}</DialogTitle>
            <DialogDescription>{confirmation?.description}</DialogDescription>
          </DialogHeader>
          {confirmation?.choice && (
            <EditorSelect
              label={confirmation.choice.label}
              value={confirmation.choice.value}
              onChange={setConfirmationChoice}
              options={confirmation.choice.options}
            />
          )}
          <DialogFooter>
            {(confirmation?.title === "Load the saved workspace?" ||
              confirmation?.title === "Restore backup?") && (
              <Button variant="outline" onClick={downloadBackup}>
                Download local backup
              </Button>
            )}
            <Button
              ref={cancelButton}
              variant="outline"
              onClick={cancelConfirmation}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={acceptConfirmation}>
              {confirmation?.confirmLabel ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
