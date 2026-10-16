"use client";

import { useEffect, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  checkAccountDeletion,
  cleanupDeletedAccount,
  resumeAccountAfterSignIn,
} from "@/stores/session/account-deletion";
import {
  DELETION_PREFIX,
  type DeletionMarker,
  readDeletion,
  subscribeDeletion,
} from "@/stores/session/deletion-state";
import { useSession, useSessionActions } from "@/stores/session/provider";

export function AccountDeletionGuard() {
  const session = useSession();
  const actions = useSessionActions();
  const userId =
    session.status === "authenticated" ? session.userId : undefined;
  const [entry, setEntry] = useState<{
    userId: string;
    marker: DeletionMarker;
  } | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const flight = useRef(false);
  const currentUser = useRef(userId);
  useEffect(() => {
    currentUser.current = userId;
  }, [userId]);

  useEffect(() => {
    const refresh = () => {
      try {
        const users = Array.from({ length: localStorage.length }, (_, i) =>
          localStorage.key(i),
        )
          .filter((key): key is string => !!key?.startsWith(DELETION_PREFIX))
          .map((key) => decodeURIComponent(key.slice(DELETION_PREFIX.length)));
        const candidates = userId
          ? [userId, ...users.filter((id) => id !== userId)]
          : users;
        const next = candidates
          .map((id) => ({ userId: id, marker: readDeletion(id) }))
          .find(
            (item) =>
              item.marker &&
              (item.marker.state !== "clean" || item.userId === userId),
          );
        setEntry(
          next?.marker ? { userId: next.userId, marker: next.marker } : null,
        );
      } catch {
        setError(
          "Browser deletion cleanup could not be checked. Retry after allowing browser storage.",
        );
      }
    };
    refresh();
    return subscribeDeletion(refresh);
  }, [userId]);

  async function finish(id: string) {
    if (flight.current) return;
    flight.current = true;
    setWorking(true);
    setError("");
    try {
      await cleanupDeletedAccount(id);
      if (!currentUser.current || currentUser.current === id) {
        // Full navigation releases all deleted-account data still held by React.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/welcome?accountDeleted=1");
      }
    } catch {
      setError(
        "Your account was deleted. Browser recovery cleanup could not finish. Retry cleanup; guest data and other accounts are preserved.",
      );
    } finally {
      flight.current = false;
      setWorking(false);
    }
  }

  useEffect(() => {
    // Retry failures explicitly; a marker transition or startup triggers the first attempt.
    let active = true;
    if (
      window.location.pathname !== "/help" &&
      entry?.marker.state === "deleted"
    )
      queueMicrotask(() => {
        if (active) void finish(entry.userId);
      });
    return () => {
      active = false;
    };
  }, [entry?.userId, entry?.marker.state]);

  if (typeof window !== "undefined" && window.location.pathname === "/help")
    return null;
  if (!entry)
    return error ? (
      <Alert>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    ) : null;
  const blocked = entry.userId === userId;
  const deleted =
    entry.marker.state === "deleted" || entry.marker.state === "clean";
  const content = (
    <>
      <p>
        {deleted
          ? "Active account data and sign-in sessions have been deleted."
          : "Editing is paused while deletion is checked. Recovery data is kept until deletion is confirmed."}
      </p>
      {error && <p role="alert">{error}</p>}
      {!deleted && (
        <Button
          disabled={working}
          onClick={() => {
            setWorking(true);
            setError("");
            void checkAccountDeletion(entry.userId)
              .catch((cause) =>
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "Deletion could not be confirmed. Please retry.",
                ),
              )
              .finally(() => setWorking(false));
          }}
        >
          Check deletion status
        </Button>
      )}
      {!deleted && blocked && session.status === "authenticated" && (
        <>
          <Button
            variant="outline"
            disabled={working || actions?.busy}
            onClick={() => {
              setWorking(true);
              setError("");
              void resumeAccountAfterSignIn(
                session.userId,
                session.sessionId ?? "",
              )
                .catch((cause) =>
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Sign in again to resume.",
                  ),
                )
                .finally(() => setWorking(false));
            }}
          >
            Cancel deletion and resume after sign-in
          </Button>
          <Button
            variant="outline"
            disabled={working || actions?.busy}
            onClick={() => void actions?.reauthenticateDeletion()}
          >
            Sign in again
          </Button>
        </>
      )}
      {deleted && (
        <Button disabled={working} onClick={() => void finish(entry.userId)}>
          {working ? "Cleaning browser recovery…" : "Finish browser cleanup"}
        </Button>
      )}
      <a href="/help" className="underline">
        Help
      </a>
    </>
  );
  if (!blocked)
    return (
      <Alert>
        <AlertTitle>Account deletion needs attention</AlertTitle>
        <AlertDescription>{content}</AlertDescription>
      </Alert>
    );
  return (
    <Dialog open>
      <DialogContent showCloseButton={false}>
        <DialogTitle>
          {deleted ? "Account deleted" : "Deletion could not be confirmed"}
        </DialogTitle>
        <DialogDescription>
          Checking status cancels a deletion that has not committed, then safely
          resumes your workspace.
        </DialogDescription>
        {content}
      </DialogContent>
    </Dialog>
  );
}
