"use client";

import { UserRoundX } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AccountDeletionError } from "@/stores/session/account-deletion";
import {
  useOptionalSession,
  useSessionActions,
} from "@/stores/session/provider";
import { useOptionalWorkspace } from "@/stores/workspace/provider";

const REAUTH_KEY = "dayplan.delete-reauth.v1";
// A departure can briefly remount settings before navigation completes. Only
// a new document may consume the return marker, never that departing document.
const documentId = crypto.randomUUID();

export function DeleteAccount({
  email,
  beforeReauthentication,
}: {
  email?: string;
  beforeReauthentication?: () => Promise<boolean>;
}) {
  const session = useOptionalSession();
  const actions = useSessionActions();
  const workspace = useOptionalWorkspace();
  const [returned] = useState(() => {
    try {
      const stored = sessionStorage.getItem(REAUTH_KEY);
      if (!stored) return null;
      try {
        const value = JSON.parse(stored);
        return value.documentId === documentId
          ? null
          : typeof value.userId === "string"
            ? value.userId
            : null;
      } catch {
        return stored; // Return markers from earlier versions contain the owner ID.
      }
    } catch {
      return null;
    }
  });
  const [open, setOpen] = useState(!!returned);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState(
    returned
      ? session?.status === "authenticated" && returned === session.userId
        ? "Sign-in completed. Review and confirm deletion again."
        : "A different account signed in. The previous deletion was cancelled. Close this dialog before choosing another account to delete."
      : "",
  );
  const [pending, setPending] = useState(false);
  const [mismatched, setMismatched] = useState(
    !!returned &&
      session?.status === "authenticated" &&
      returned !== session.userId,
  );
  const [stage, setStage] = useState<
    "checking" | "verify" | "confirm" | "error"
  >("checking");
  const cancel = useRef<HTMLButtonElement>(null);
  const locked = useRef(false);
  const resumed = useRef(false);
  const checkOnReturn = useEffectEvent(checkEligibility);

  useEffect(() => {
    if (
      !returned ||
      resumed.current ||
      !actions ||
      session?.status !== "authenticated"
    )
      return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      resumed.current = true;
      try {
        sessionStorage.removeItem(REAUTH_KEY);
      } catch {
        /* Safe to retry verification. */
      }
      if (returned === session.userId) void checkOnReturn();
      else setStage("error");
    });
    return () => {
      active = false;
    };
  }, [returned, actions, session]);

  function showFailure(cause: unknown) {
    setConfirmation("");
    setStage(
      cause instanceof AccountDeletionError &&
        ["unauthorized", "session_mismatch"].includes(cause.code)
        ? "verify"
        : "error",
    );
    setError(
      cause instanceof Error
        ? cause.message
        : "Account deletion failed. Please retry.",
    );
  }

  function close() {
    setConfirmation("");
    setOpen(false);
    try {
      sessionStorage.removeItem(REAUTH_KEY);
    } catch {
      // Closing never depends on browser storage being available.
    }
  }

  async function checkEligibility() {
    if (locked.current || !actions) return;
    locked.current = true;
    setPending(true);
    setOpen(true);
    setStage("checking");
    setConfirmation("");
    setError("");
    try {
      await actions.checkDeletionEligibility();
      setStage("confirm");
    } catch (cause) {
      showFailure(cause);
    } finally {
      locked.current = false;
      setPending(false);
    }
  }

  if (session?.status !== "authenticated" || !workspace) return null;
  const { downloadBackup, busy } = workspace;
  const account = session;
  async function submit() {
    if (
      locked.current ||
      stage !== "confirm" ||
      mismatched ||
      confirmation !== "DELETE" ||
      !actions
    )
      return;
    locked.current = true;
    setPending(true);
    setError("");
    try {
      await actions.deleteAccount();
    } catch (cause) {
      showFailure(cause);
    } finally {
      locked.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-destructive text-sm font-medium">Delete account</p>
          <p className="text-muted-foreground text-sm">
            Permanently remove your account and workspace.
          </p>
        </div>
        <Button
          variant="destructive"
          disabled={pending || busy || actions?.busy || !actions}
          onClick={() => {
            setConfirmation("");
            setError("");
            setMismatched(false);
            void checkEligibility();
          }}
        >
          <UserRoundX data-icon="inline-start" aria-hidden="true" />
          Delete account
        </Button>
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!pending) {
            if (!next) close();
            else setOpen(true);
          }
        }}
      >
        <DialogContent initialFocus={cancel} showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>
              {stage === "confirm"
                ? "Delete your account permanently?"
                : "Verify before deleting your account"}
            </DialogTitle>
            <DialogDescription>
              {stage === "confirm" ? (
                <>
                  This removes {email ?? "this account"}, its workspace,
                  connected sign-in methods, sessions, and browser recovery
                  data. This cannot be undone. Independent guest data and other
                  accounts are kept.
                </>
              ) : (
                "Signing in again may be required before you can confirm deletion. Your account data is kept until you explicitly confirm."
              )}
            </DialogDescription>
          </DialogHeader>
          {stage === "checking" && (
            <p role="status">Checking deletion eligibility…</p>
          )}
          {stage === "confirm" && (
            <>
              <p className="text-sm">
                Unsaved task and profile drafts will also be lost. Cancel and
                save or review drafts first if you want them in your backup. The
                backup includes committed workspace edits, including edits
                waiting to sync; it excludes open editor drafts and your
                profile.
              </p>
              <Button
                variant="outline"
                disabled={pending}
                onClick={downloadBackup}
              >
                Download workspace backup
              </Button>
            </>
          )}
          {error && (
            <Alert>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {stage === "verify" ? (
            <>
              <p>
                Sign in again to verify this account before confirming deletion.
                You will return here to review a fresh confirmation.
              </p>
              <Button
                disabled={pending || actions?.busy}
                onClick={() => {
                  try {
                    sessionStorage.setItem(
                      REAUTH_KEY,
                      JSON.stringify({ userId: account.userId, documentId }),
                    );
                    void actions?.switchAccount(
                      "/today?settings=account",
                      beforeReauthentication,
                    );
                  } catch {
                    setError(
                      "Browser session storage is unavailable. Sign-in has not started; keep this page open and retry.",
                    );
                  }
                }}
              >
                Sign in again
              </Button>
            </>
          ) : stage === "confirm" ? (
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="delete-confirmation">
                  Type DELETE to confirm
                </FieldLabel>
                <Input
                  id="delete-confirmation"
                  value={confirmation}
                  disabled={pending}
                  autoComplete="off"
                  onChange={(event) => setConfirmation(event.target.value)}
                  aria-describedby="delete-help"
                />
                <FieldDescription id="delete-help">
                  Your session is validated again when you confirm deletion.
                </FieldDescription>
              </Field>
            </FieldGroup>
          ) : stage === "error" && !mismatched ? (
            <Button disabled={pending} onClick={() => void checkEligibility()}>
              Retry eligibility check
            </Button>
          ) : null}
          <DialogFooter>
            <Button
              ref={cancel}
              variant="outline"
              disabled={pending && stage !== "checking"}
              onClick={close}
            >
              Cancel
            </Button>
            {stage === "confirm" && (
              <Button
                variant="destructive"
                disabled={
                  pending || mismatched || confirmation !== "DELETE" || !actions
                }
                onClick={() => void submit()}
              >
                {pending ? "Deleting…" : "Permanently delete account"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
