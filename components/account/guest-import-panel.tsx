"use client";

import { Import, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
import type { GuestData } from "@/stores/workspace/guest-data";
import {
  useOptionalWorkspace,
  useWorkspace,
} from "@/stores/workspace/provider";
import type { Workspace } from "@/types-and-constants/workspace";

const importDescription =
  "This adds your guest workspace to this account. After a successful import, the imported guest workspace and guest profile name will be deleted from this browser. Your account data will be kept. Newer guest changes will be preserved.";

export function GuestImportPanel({ always = false }: { always?: boolean }) {
  const workspace = useOptionalWorkspace();
  if (!workspace) return null;
  return <GuestImportContent always={always} />;
}

function GuestImportContent({ always }: { always: boolean }) {
  const workspace = useWorkspace();
  const guest = workspace.guestData?.snapshot;
  const [dismissed, setDismissed] = useState(false);
  const [preview, setPreview] = useState<{
    details: ImportPreview;
    snapshot: Workspace;
  } | null>(null);
  const [discard, setDiscard] = useState<GuestData | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  if (
    workspace.persistenceKind !== "database" ||
    !workspace.ready ||
    workspace.hasPendingImport ||
    (!always && dismissed) ||
    (!guest && !workspace.guestDataError)
  )
    return null;

  const blocked = pending || workspace.busy || workspace.hasPendingGuestCleanup;
  const description =
    error ||
    workspace.guestDataError ||
    "Add your guest workspace to this account, or permanently discard the guest workspace and profile name from this browser.";

  async function inspect() {
    if (!guest || blocked) return;
    setPending(true);
    setError("");
    try {
      const details = await workspace.previewGuestImport(guest);
      if (active.current) setPreview({ details, snapshot: guest });
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
    if (!preview || blocked) return;
    setPending(true);
    const success = await workspace.importGuest(
      preview.snapshot,
      preview.details.historyToken,
    );
    if (active.current) {
      setPending(false);
      setPreview(null);
      if (success) {
        setError("");
        setDismissed(true);
      }
    }
  }

  const actions = (
    <>
      <Button
        variant="outline"
        disabled={!workspace.guestData || blocked}
        onClick={() => {
          setError("");
          setDiscard(workspace.guestData);
        }}
      >
        <Trash2 data-icon="inline-start" aria-hidden="true" />
        Discard guest data
      </Button>
      <Button
        disabled={!guest || blocked || !!workspace.error}
        onClick={() => void inspect()}
      >
        <Import data-icon="inline-start" aria-hidden="true" />
        Import guest data
      </Button>
    </>
  );

  return (
    <>
      {always ? (
        <section className="flex flex-col gap-3" aria-label="Guest data">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">
              {guest ? "Guest data available" : "Guest data needs attention"}
            </h3>
            <p className="text-muted-foreground text-sm leading-normal">
              {description}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">{actions}</div>
        </section>
      ) : (
        <Dialog
          open={!dismissed && !preview && !discard}
          onOpenChange={(open) => {
            if (!open && !pending) setDismissed(true);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {guest ? "Guest data available" : "Guest data needs attention"}
              </DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <DialogFooter>{actions}</DialogFooter>
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
              {preview?.details.alreadyImported
                ? "Recover imported workspace?"
                : "Import guest data?"}
            </DialogTitle>
            <DialogDescription>
              {preview?.details.alreadyImported
                ? "This guest snapshot was already imported. Load the current account workspace without adding duplicates. "
                : preview?.details.hasPriorImports
                  ? "Importing again adds separate copies of the entire guest workspace, including items imported before. "
                  : ""}
              {importDescription}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setPreview(null)}
            >
              <X data-icon="inline-start" aria-hidden="true" />
              Cancel
            </Button>
            <Button disabled={blocked} onClick={() => void importConfirmed()}>
              <Import data-icon="inline-start" aria-hidden="true" />
              {pending ? "Importing..." : "Confirm import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!discard}
        onOpenChange={(open) => {
          if (!open) setDiscard(null);
        }}
      >
        <DialogContent initialFocus={cancelButton}>
          <DialogHeader>
            <DialogTitle>Discard guest data?</DialogTitle>
            <DialogDescription>
              Permanently delete the guest workspace and guest profile name from
              this browser? Your account data will be kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              ref={cancelButton}
              variant="outline"
              onClick={() => setDiscard(null)}
            >
              <X data-icon="inline-start" aria-hidden="true" />
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={blocked}
              onClick={() => {
                if (!discard) return;
                const success = workspace.discardGuest(discard);
                setDiscard(null);
                if (success) setDismissed(true);
              }}
            >
              <Trash2 data-icon="inline-start" aria-hidden="true" />
              Confirm discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
