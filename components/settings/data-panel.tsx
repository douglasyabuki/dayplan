"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useWorkspace } from "@/stores/workspace/provider";

export function DataPanel({
  onReset,
  onClear,
}: {
  onReset: () => void;
  onClear: () => void;
}) {
  const { state, persistenceKind, ready, busy, error, hasPendingImport } =
    useWorkspace();
  const account = persistenceKind === "database";
  const disabled = !ready || busy || hasPendingImport || (account && !!error);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Your workspace</h3>
        <p className="text-muted-foreground text-sm leading-normal">
          {account
            ? "Your workspace is saved to your account."
            : "Your workspace is saved in this browser."}
          <br />
          Timezone: {state.timezone.replaceAll("_", " ")}
        </p>
      </div>
      {!account && (
        <>
          <Separator />
          <div className="flex flex-col items-start gap-2">
            <h3 className="text-sm font-medium">Reset workspace</h3>
            <p className="text-muted-foreground text-sm leading-normal">
              Replace your tasks, projects, and tags with fresh sample data.
              Your account profile is kept. You will be asked to confirm before
              resetting.
            </p>
            <Button variant="outline" disabled={disabled} onClick={onReset}>
              Reset to sample data
            </Button>
          </div>
        </>
      )}
      <Separator />
      <div className="flex flex-col items-start gap-2">
        <h3 className="text-sm font-medium">Clear data</h3>
        <p className="text-muted-foreground text-sm leading-normal">
          Remove all tasks, projects, tags, and related workspace data
          {account ? " from your account" : " from this browser"}. Your profile,
          theme, and timezone are kept.
        </p>
        <Button variant="destructive" disabled={disabled} onClick={onClear}>
          Clear data
        </Button>
      </div>
    </div>
  );
}
