import { forgetAccountDataSources } from "@/stores/workspace/account-data-source";
import { accountCoordinated, bounded } from "@/stores/workspace/coordination";
import { guestCleanupKey } from "@/stores/workspace/guest-data";
import { purgeAccountRecovery } from "@/stores/workspace/recovery-journal";

import {
  cancelDeletion,
  type DeletionMarker,
  readDeletion,
  writeDeletion,
} from "./deletion-state";

export class AccountDeletionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request(
  method: "PATCH" | "POST" | "DELETE",
  sessionId?: string,
  capability?: string,
  resume = false,
  checkOnly = false,
) {
  return bounded(
    new AbortController().signal,
    Date.now() + 10_000,
    async (signal) => {
      const response = await fetch("/api/account", {
        method,
        signal,
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          ...(sessionId ? { "X-Dayplan-Session": sessionId } : {}),
          ...(capability ? { "X-Dayplan-Deletion": capability } : {}),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          method === "DELETE"
            ? { confirmation: "DELETE" }
            : resume
              ? { resume: true }
              : checkOnly
                ? { checkOnly: true }
                : {},
        ),
      });
      const result = await response.json();
      if (!response.ok)
        throw new AccountDeletionError(
          result.code ?? "storage_error",
          result.message ?? "Account deletion failed. Please retry.",
        );
      return result as {
        capability?: string;
        deleted?: boolean;
        resumed?: boolean;
        eligible?: boolean;
      };
    },
  );
}

export async function checkAccountDeletionEligibility(sessionId: string) {
  const result = await request("POST", sessionId, undefined, false, true);
  if (result.eligible !== true)
    throw new Error("Deletion eligibility could not be checked. Please retry.");
}

export async function prepareAccountDeletion(sessionId: string) {
  // Creates an intent: only call after explicit destructive confirmation.
  const prepared = await request("POST", sessionId);
  if (typeof prepared.capability !== "string" || !prepared.capability)
    throw new Error("Account deletion could not start.");
  return prepared.capability;
}

export async function beginAccountDeletion(userId: string, sessionId: string) {
  const capability = await prepareAccountDeletion(sessionId);
  await accountCoordinated(
    userId,
    new AbortController().signal,
    Date.now() + 15_000,
    async () => {
      if (readDeletion(userId))
        throw new Error("Deletion is already in progress. Check its status.");
      const marker: DeletionMarker = {
        state: "pending",
        capability,
        attempt: crypto.randomUUID(),
      };
      writeDeletion(userId, marker);
      try {
        const result = await request("DELETE", sessionId, marker.capability);
        if (result.deleted !== true)
          throw new Error("Deletion could not be confirmed.");
        writeDeletion(userId, { ...marker, state: "deleted" });
      } catch (error) {
        // Only a definitive rejection before commit permits editing to resume.
        if (
          error instanceof AccountDeletionError &&
          [
            "deletion_cancelled",
            "confirmation_required",
            "unauthorized",
            "session_mismatch",
            "invalid_input",
            "deletion_status_expired",
          ].includes(error.code)
        ) {
          cancelDeletion(userId, marker.attempt);
          throw error;
        }
        writeDeletion(userId, { ...marker, state: "unknown" });
      }
    },
  );
}

export async function checkAccountDeletion(userId: string) {
  const marker = readDeletion(userId);
  if (!marker || marker.state === "clean" || marker.state === "deleted") return;
  const result = await request("PATCH", undefined, marker.capability);
  if (result.deleted === true)
    writeDeletion(userId, { ...marker, state: "deleted" });
  else if (result.deleted === false) cancelDeletion(userId, marker.attempt);
  else
    throw new Error("Deletion could not be confirmed. Please retry checking.");
}

export async function resumeAccountAfterSignIn(
  userId: string,
  sessionId: string,
) {
  const marker = readDeletion(userId);
  if (!marker || marker.state === "deleted" || marker.state === "clean") return;
  const result = await request("POST", sessionId, undefined, true);
  if (result.resumed !== true)
    throw new Error(
      "Account editing is still paused. Retry after signing in again.",
    );
  cancelDeletion(userId, marker.attempt);
}

export async function cleanupDeletedAccount(userId: string) {
  const marker = readDeletion(userId);
  if (!marker || marker.state !== "deleted") return;
  await accountCoordinated(
    userId,
    new AbortController().signal,
    Date.now() + 8000,
    async () => {
      await bounded(new AbortController().signal, Date.now() + 5000, (signal) =>
        purgeAccountRecovery(userId, signal),
      );
      localStorage.removeItem(guestCleanupKey(userId));
      if (localStorage.getItem(guestCleanupKey(userId)) !== null)
        throw new Error("Browser import recovery could not be removed.");
      forgetAccountDataSources(userId);
      // Retain a minimal tombstone so suspended tabs cannot recreate recovery data.
      writeDeletion(userId, { ...marker, state: "clean", capability: "" });
    },
  );
}
