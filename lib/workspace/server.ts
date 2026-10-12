import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { Prisma } from "@/lib/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { emptyWorkspace } from "@/lib/workspace/empty";
import { mergeGuestWorkspace } from "@/lib/workspace/import";
import { validateWorkspace } from "@/stores/workspace/validation";
import type { Workspace } from "@/types-and-constants/workspace";

export class WorkspaceAccessError extends Error {
  /**
   * Describes a rejected persistence operation with a stable recovery code.
   * @param status HTTP response status.
   * @param code Machine-readable validation or recovery code.
   * @param message Safe explanation for the browser.
   * @returns {WorkspaceAccessError} An error carrying the status, code and message.
   * @example throw new WorkspaceAccessError(409, "revision_conflict", "Reload before saving.");
   */
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Serializes JSON deterministically for receipt identity.
 * @param value JSON-compatible value to serialize.
 * @returns {string} Canonical JSON with object keys sorted recursively.
 * @example canonicalJson({ b: 1, a: 2 }) === '{"a":2,"b":1}';
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return "[" + value.map(canonicalJson).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonicalJson(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}

/**
 * Hashes canonical request content without storing credentials.
 * @param value JSON-compatible request content.
 * @returns {string} SHA-256 hexadecimal digest.
 * @example contentHash({ expectedRevision: 0, snapshot });
 */
export function contentHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

/**
 * Reads one verified owner's workspace, validating stored JSON.
 * @param userId User ID obtained from a verified server session.
 * @returns {Promise<{ snapshot: Workspace | null; revision: number }>} Current snapshot and revision, or null at revision zero.
 * @example await loadAccountWorkspace(session.userId);
 */
export async function loadAccountWorkspace(
  userId: string,
): Promise<{ snapshot: Workspace | null; revision: number }> {
  const row = await getPrisma().workspace.findUnique({ where: { userId } });
  return {
    snapshot: row ? validateWorkspace(row.snapshot) : null,
    revision: row?.revision ?? 0,
  };
}

/**
 * Locks an existing owner row to serialize saves and imports even before workspace creation.
 * @param tx Transaction client.
 * @param userId Verified owner.
 * @returns {Promise<void>} Resolves after acquiring the owner lock; throws for a deleted account.
 * @example await lockOwner(tx, userId);
 */
async function lockOwner(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`;
  if (!rows.length)
    throw new WorkspaceAccessError(
      401,
      "unauthorized",
      "Your account is no longer available.",
    );
}

/**
 * Saves a revision-conditionally updated snapshot with an atomic idempotency receipt.
 * @param userId Verified owner.
 * @param input Immutable operation ID, validated snapshot and expected revision.
 * @returns {Promise<{ committedRevision: number; currentRevision: number }>} Original commit and current revision; retries never reapply the write.
 * @example await saveAccountWorkspace(userId, { operationId, snapshot, expectedRevision: 0 });
 */
export async function saveAccountWorkspace(
  userId: string,
  input: { operationId: string; snapshot: Workspace; expectedRevision: number },
): Promise<{ committedRevision: number; currentRevision: number }> {
  const snapshot = validateWorkspace(structuredClone(input.snapshot));
  const requestHash = contentHash({
    snapshot,
    expectedRevision: input.expectedRevision,
  });
  return getPrisma().$transaction(async (tx) => {
    await lockOwner(tx, userId);
    const prior = await tx.workspaceSave.findUnique({
      where: { userId_operationId: { userId, operationId: input.operationId } },
    });
    const row = await tx.workspace.findUnique({ where: { userId } });
    if (prior) {
      if (prior.requestHash !== requestHash)
        throw new WorkspaceAccessError(
          409,
          "operation_mismatch",
          "This save ID was already used for different content.",
        );
      return {
        committedRevision: prior.committedRevision,
        currentRevision: row?.revision ?? 0,
      };
    }
    if ((row?.revision ?? 0) !== input.expectedRevision)
      throw new WorkspaceAccessError(
        409,
        "revision_conflict",
        "Another tab or device saved a newer workspace. Download your local backup before reloading.",
      );
    const revision = input.expectedRevision + 1;
    const json = JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue;
    if (row) {
      const result = await tx.workspace.updateMany({
        where: { userId, revision: input.expectedRevision },
        data: { snapshot: json, revision },
      });
      if (result.count !== 1)
        throw new WorkspaceAccessError(
          409,
          "revision_conflict",
          "Your saved workspace changed.",
        );
    } else
      await tx.workspace.create({ data: { userId, snapshot: json, revision } });
    await tx.workspaceSave.create({
      data: {
        userId,
        operationId: input.operationId,
        requestHash,
        committedRevision: revision,
      },
    });
    return { committedRevision: revision, currentRevision: revision };
  });
}

/**
 * Previews account import history to bind repeat-import confirmation to current history.
 * @param userId Verified owner.
 * @param snapshot Validated guest snapshot.
 * @returns {Promise<{ historyToken: string; hasPriorImports: boolean; alreadyImported: boolean }>} History fingerprint, repeat warning flag and identical-import receipt status.
 * @example await previewGuestImport(userId, snapshot);
 */
export async function previewGuestImport(
  userId: string,
  snapshot: Workspace,
): Promise<{
  historyToken: string;
  hasPriorImports: boolean;
  alreadyImported: boolean;
}> {
  const hashes = (
    await getPrisma().workspaceImport.findMany({
      where: { userId },
      select: { snapshotHash: true },
    })
  )
    .map((e) => e.snapshotHash)
    .sort();
  const hash = contentHash(snapshot);
  return {
    historyToken: contentHash(hashes),
    hasPriorImports: hashes.length > 0 && !hashes.includes(hash),
    alreadyImported: hashes.includes(hash),
  };
}

/**
 * Atomically imports independent guest copies or returns current state for an identical retry.
 * @param userId Verified owner.
 * @param input Guest snapshot, expected account revision and explicitly confirmed preview history.
 * @returns {Promise<{ snapshot: Workspace; revision: number }>} The current account snapshot and revision, including on completed retries.
 * @example await importGuestWorkspace(userId, { snapshot, expectedRevision: 1, confirmedHistoryToken });
 */
export async function importGuestWorkspace(
  userId: string,
  input: {
    snapshot: Workspace;
    expectedRevision: number;
    confirmedHistoryToken: string;
  },
): Promise<{ snapshot: Workspace; revision: number }> {
  const guest = validateWorkspace(structuredClone(input.snapshot));
  const snapshotHash = contentHash(guest);
  return getPrisma().$transaction(async (tx) => {
    await lockOwner(tx, userId);
    const hashes = (
      await tx.workspaceImport.findMany({
        where: { userId },
        select: { snapshotHash: true },
      })
    )
      .map((e) => e.snapshotHash)
      .sort();
    const row = await tx.workspace.findUnique({ where: { userId } });
    if (hashes.includes(snapshotHash)) {
      if (!row)
        throw new WorkspaceAccessError(
          500,
          "storage_error",
          "Your imported workspace is unavailable.",
        );
      return {
        snapshot: validateWorkspace(row.snapshot),
        revision: row.revision,
      };
    }
    if (input.confirmedHistoryToken !== contentHash(hashes))
      throw new WorkspaceAccessError(
        409,
        "import_confirmation_required",
        "Import history changed. Preview and confirm the import again.",
      );
    if ((row?.revision ?? 0) !== input.expectedRevision)
      throw new WorkspaceAccessError(
        409,
        "revision_conflict",
        "Your saved workspace changed. Reload before importing.",
      );
    const snapshot = mergeGuestWorkspace(
      row ? validateWorkspace(row.snapshot) : emptyWorkspace(guest.timezone),
      guest,
      randomUUID,
    );
    const revision = (row?.revision ?? 0) + 1;
    const json = JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue;
    if (row)
      await tx.workspace.update({
        where: { userId },
        data: { snapshot: json, revision },
      });
    else
      await tx.workspace.create({ data: { userId, snapshot: json, revision } });
    await tx.workspaceImport.create({ data: { userId, snapshotHash } });
    return { snapshot, revision };
  });
}
