"use client";

import { useEffect, useRef, useState } from "react";

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
import type { ImportPreview } from "@/stores/workspace/account-data-source";
import { readWorkspace } from "@/stores/workspace/persistence";
import {
  useOptionalWorkspace,
  useWorkspace,
} from "@/stores/workspace/provider";
import type { Workspace } from "@/types-and-constants/workspace";

export function GuestImportPanel({ always = false }: { always?: boolean }) {
  const workspace = useOptionalWorkspace();
  if (!workspace) return null;
  return <GuestImportContent always={always} />;
}

function GuestImportContent({ always }: { always: boolean }) {
  const workspace = useWorkspace();
  const [guest, setGuest] = useState<Workspace | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    if (workspace.persistenceKind === "database") {
      try {
        // Read browser storage after hydration, matching the guest providers.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setGuest(readWorkspace());
      } catch {
        setError(
          "Guest data could not be read. It has not been changed; import is unavailable.",
        );
      }
    }
    return () => {
      active.current = false;
    };
  }, [workspace.persistenceKind]);
  if (
    workspace.persistenceKind !== "database" ||
    (!always && dismissed) ||
    (!guest && !error)
  )
    return null;

  async function inspect() {
    if (!guest || pending) return;
    setPending(true);
    setError("");
    try {
      const result = await workspace.previewGuestImport(guest);
      if (active.current) setPreview(result);
    } catch (cause) {
      if (active.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Import preview is unavailable.",
        );
    } finally {
      if (active.current) setPending(false);
    }
  }

  async function importConfirmed() {
    if (!guest || !preview || pending) return;
    setPending(true);
    const success = await workspace.importGuest(guest, preview.historyToken);
    if (active.current) {
      setPending(false);
      setPreview(null);
      setDismissed(true);
      if (success) {
        setError("");
      }
    }
  }

  return (
    <>
      {always ? (
        <Alert>
          <AlertTitle>Guest data available</AlertTitle>
          <AlertDescription>
            {error ||
              "You can add your guest workspace to this account. Your guest data stays in this browser."}
          </AlertDescription>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={
                !guest || pending || workspace.busy || !!workspace.error
              }
              onClick={() => void inspect()}
            >
              Import guest data
            </Button>
            {!always && (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => setDismissed(true)}
              >
                Skip
              </Button>
            )}
          </div>
        </Alert>
      ) : (
        <Dialog
          open={!dismissed && !preview}
          onOpenChange={(open) => {
            if (!open && !pending) setDismissed(true);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Guest data available</DialogTitle>
              <DialogDescription>
                {error ||
                  "You can add your guest workspace to this account. Your guest data stays in this browser."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => setDismissed(true)}
              >
                Skip
              </Button>
              <Button
                disabled={
                  !guest || pending || workspace.busy || !!workspace.error
                }
                onClick={() => void inspect()}
              >
                Import guest data
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      <Dialog
        open={!!preview}
        onOpenChange={(open) => {
          if (!open && !pending) setPreview(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {preview?.alreadyImported
                ? "Recover imported workspace?"
                : "Import guest data?"}
            </DialogTitle>
            <DialogDescription>
              {preview?.alreadyImported
                ? "This guest snapshot was already imported. Load the current account workspace without adding duplicates."
                : preview?.hasPriorImports
                  ? "Importing again adds separate copies of the entire guest workspace, including items imported before."
                  : "This adds separate copies of guest tasks, projects, sections, and tags. Existing account data is preserved."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setPreview(null)}
            >
              Cancel
            </Button>
            <Button disabled={pending} onClick={() => void importConfirmed()}>
              {pending ? "Importing…" : "Confirm import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
