"use client";

import { GuestImportPanel } from "@/components/account/guest-import-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useWorkspace } from "@/stores/workspace/provider";

export function DataPanel({
  onReset,
  onClear,
  onReload,
}: {
  onReset: () => void;
  onClear: () => void;
  onReload?: () => void;
}) {
  const workspace = useWorkspace();
  const {
    state,
    persistenceKind,
    ready,
    busy,
    error,
    hasPendingImport,
    guestData,
    guestDataError,
    guestCleanupError,
    hasPendingGuestCleanup,
    retryGuestCleanup,
    downloadBackup,
    retryImport,
    retrySave,
    reloadSaved,
    recoveryCode,
  } = workspace;
  const account = persistenceKind === "database";
  const disabled = !ready || busy || hasPendingImport || (account && !!error);
  const guestAvailable =
    account && (guestData?.snapshot || guestDataError || guestCleanupError);
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2" aria-label="Your workspace">
        <h3 className="text-sm font-medium">Your workspace</h3>
        <p className="text-muted-foreground text-sm leading-normal">
          {account
            ? "Your workspace is saved to your account."
            : "Your workspace is saved in this browser."}
        </p>
        <p className="text-muted-foreground text-xs">
          Timezone: {state.timezone.replaceAll("_", " ")}
        </p>
        {(error || hasPendingImport) && (
          <Alert variant="destructive">
            <AlertTitle>Storage needs attention</AlertTitle>
            <AlertDescription>
              {error ||
                "Resolve the pending guest import before editing your workspace."}
            </AlertDescription>
            <div className="flex flex-wrap gap-2">
              {account ? (
                <>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={onReload ?? reloadSaved}
                  >
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
                  ) : (
                    recoveryCode !== "revision_conflict" &&
                    recoveryCode !== "load_failed" && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={retrySave}
                      >
                        Retry save
                      </Button>
                    )
                  )}
                </>
              ) : (
                <Button variant="outline" onClick={() => location.reload()}>
                  Retry loading
                </Button>
              )}
            </div>
          </Alert>
        )}
      </section>
      {guestAvailable && (
        <>
          <Separator />
          <GuestImportPanel always />
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
        </>
      )}
      <Separator />
      <section className="flex flex-col items-start gap-3" aria-label="Backup">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Backup</h3>
          <p className="text-muted-foreground text-sm leading-normal">
            Download a JSON copy of your current workspace before replacing or
            clearing data.
          </p>
        </div>
        <Button variant="outline" disabled={!ready} onClick={downloadBackup}>
          Download backup
        </Button>
      </section>
      <Separator />
      <section
        className="flex flex-col items-start gap-3"
        aria-label="Sample data"
      >
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Sample data</h3>
          <p className="text-muted-foreground text-sm leading-normal">
            Replace all tasks, projects, tags, and related workspace data{" "}
            {account ? "in your account" : "in this browser"} with fresh
            examples. Your profile, theme, and timezone are kept. You will be
            asked to confirm.
          </p>
        </div>
        <Button variant="outline" disabled={disabled} onClick={onReset}>
          Reset to sample data
        </Button>
      </section>
      <Separator />
      <section
        className="flex flex-col items-start gap-3"
        aria-label="Clear data"
      >
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Clear data</h3>
          <p className="text-muted-foreground text-sm leading-normal">
            Permanently remove all tasks, projects, tags, and related workspace
            data {account ? "from your account" : "from this browser"}. Your
            profile, theme, and timezone are kept. You will be asked to confirm.
          </p>
        </div>
        <Button variant="destructive" disabled={disabled} onClick={onClear}>
          Clear data
        </Button>
      </section>
    </div>
  );
}
