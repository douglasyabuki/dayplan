import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { getPrisma } from "@/lib/prisma";
import { WorkspaceAccessError } from "@/lib/workspace/server";

type DeletionCapability = {
  userId: string;
  sessionId: string;
  expires: number;
  intent: string;
};

/**
 * Signs a short-lived capability that can only inspect one account's deletion outcome.
 * @param userId Verified account owner.
 * @param sessionId Verified initiating session.
 * @returns {Promise<string>} Signed status capability valid for thirty minutes, after preparing an authenticated intent.
 * @example const capability = await deletionCapability(context.userId, context.sessionId);
 */
export async function deletionCapability(
  userId: string,
  sessionId: string,
): Promise<string> {
  const intent = `dayplan-deletion:${randomUUID()}`;
  const expires = Date.now() + 30 * 60_000;
  await getPrisma().$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`;
    if (!rows.length)
      throw new WorkspaceAccessError(
        401,
        "unauthorized",
        "Your account is no longer available.",
      );
    assertValidDeletionSession(
      await tx.session.findFirst({ where: { id: sessionId, userId } }),
    );
    await tx.verification.deleteMany({
      where: { identifier: { startsWith: "dayplan-deletion:" }, value: userId },
    });
    await tx.verification.create({
      data: {
        id: randomUUID(),
        identifier: intent,
        value: userId,
        expiresAt: new Date(expires),
      },
    });
  });
  const payload = Buffer.from(
    JSON.stringify({ userId, sessionId, expires, intent }),
  ).toString("base64url");
  const signature = createHmac("sha256", process.env.BETTER_AUTH_SECRET!)
    .update(`dayplan-delete:${payload}`)
    .digest("base64url");
  return `${payload}.${signature}`;
}

/**
 * Checks a status capability without accepting it as authentication for deletion.
 * @param token Untrusted capability from the request header.
 * @returns {DeletionCapability} Signed owner and session binding; throws for invalid or expired capabilities.
 * @example const binding = readDeletionCapability(request.headers.get("X-Dayplan-Deletion"));
 */
export function readDeletionCapability(
  token: string | null,
): DeletionCapability {
  try {
    if (!token || token.length > 4096) throw new Error();
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) throw new Error();
    const expected = createHmac("sha256", process.env.BETTER_AUTH_SECRET!)
      .update(`dayplan-delete:${payload}`)
      .digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new Error();
    const value = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    ) as DeletionCapability;
    if (
      typeof value.userId !== "string" ||
      typeof value.sessionId !== "string" ||
      typeof value.intent !== "string" ||
      !value.intent.startsWith("dayplan-deletion:") ||
      !Number.isFinite(value.expires) ||
      value.expires <= Date.now()
    )
      throw new Error();
    return value;
  } catch {
    throw new WorkspaceAccessError(
      403,
      "deletion_status_expired",
      "Deletion status access expired. Sign in again to check your account; deletion will never restart automatically.",
    );
  }
}

/**
 * Requires a current, unexpired database session, regardless of sign-in age.
 * @param session Session row read from the database.
 * @returns {void} Returns for valid authentication; otherwise requires sign-in.
 * @example assertValidDeletionSession(await prisma.session.findUnique({ where: { id } }));
 */
export function assertValidDeletionSession(
  session: { expiresAt: Date } | null,
): void {
  if (!session || session.expiresAt.getTime() <= Date.now())
    throw new WorkspaceAccessError(
      401,
      "unauthorized",
      "Sign in again to access your account.",
    );
}

/**
 * Deletes active account data atomically, serialized against workspace saves and imports.
 * @param userId Owner derived exclusively from the verified server session.
 * @param sessionId Initiating session to revalidate after acquiring the owner lock.
 * @param capability Signed, session-bound prepared deletion intent.
 * @returns {Promise<void>} Resolves after the user and cascading owned rows are deleted; failures roll back.
 * @example await deleteAccount(context.userId, context.sessionId, capability);
 */
export async function deleteAccount(
  userId: string,
  sessionId: string,
  capability: string,
): Promise<void> {
  const binding = readDeletionCapability(capability);
  if (binding.userId !== userId || binding.sessionId !== sessionId)
    throw new WorkspaceAccessError(
      403,
      "session_mismatch",
      "Your account changed. Confirm deletion again.",
    );
  await getPrisma().$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`;
    if (!rows.length)
      throw new WorkspaceAccessError(
        401,
        "unauthorized",
        "Your account is no longer available.",
      );
    const session = await tx.session.findFirst({
      where: { id: sessionId, userId },
    });
    assertValidDeletionSession(session);
    const intent = await tx.verification.findFirst({
      where: {
        identifier: binding.intent,
        value: userId,
        expiresAt: { gt: new Date() },
      },
    });
    if (!intent)
      throw new WorkspaceAccessError(
        409,
        "deletion_cancelled",
        "The deletion attempt was cancelled. Confirm again to start a new attempt.",
      );
    // Better Auth 1.7 stores database OAuth link state as JSON with link.userId.
    // Match the explicit owner, never an email substring or an unrelated sign-in.
    const authStates = await tx.verification.findMany({
      where: { identifier: { startsWith: "auth-state:" } },
      select: { id: true, value: true },
    });
    const ownedStates = authStates
      .filter((state) => {
        try {
          const value: unknown = JSON.parse(state.value);
          return (
            !!value &&
            typeof value === "object" &&
            "link" in value &&
            !!value.link &&
            typeof value.link === "object" &&
            "userId" in value.link &&
            value.link.userId === userId
          );
        } catch {
          return false;
        }
      })
      .map((state) => state.id);
    if (ownedStates.length)
      await tx.verification.deleteMany({ where: { id: { in: ownedStates } } });
    // Deletion intents also have explicit account ownership.
    await tx.verification.deleteMany({
      where: { value: userId, identifier: { startsWith: "dayplan-deletion:" } },
    });
    await tx.user.delete({ where: { id: userId } });
  });
}

/**
 * Settles an ambiguous deletion by serializing with DELETE and cancelling a request that has not committed.
 * @param token Signed status capability; it never authorizes account deletion.
 * @returns {Promise<{ deleted: boolean }>} True if the user is absent; false after cancelling the prepared intent, making resume safe.
 * @example const outcome = await settleAccountDeletion(token);
 */
export async function settleAccountDeletion(
  token: string | null,
): Promise<{ deleted: boolean }> {
  const binding = readDeletionCapability(token);
  return getPrisma().$transaction(async (tx) => {
    const users = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "user" WHERE id = ${binding.userId} FOR UPDATE`;
    if (!users.length) return { deleted: true };
    await tx.verification.deleteMany({
      where: { identifier: binding.intent, value: binding.userId },
    });
    return { deleted: false };
  });
}

/**
 * Resumes a still-existing account after authentication when its status capability expired.
 * @param userId Verified current owner, never taken from browser metadata.
 * @param sessionId Current session to verify under the owner lock.
 * @returns {Promise<void>} Resolves after all pending deletion intents for that owner are cancelled.
 * @example await resumeAccountDeletion(context.userId, context.sessionId);
 */
export async function resumeAccountDeletion(
  userId: string,
  sessionId: string,
): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "user" WHERE id = ${userId} FOR UPDATE`;
    if (!rows.length)
      throw new WorkspaceAccessError(
        401,
        "unauthorized",
        "Your account is no longer available.",
      );
    assertValidDeletionSession(
      await tx.session.findFirst({ where: { id: sessionId, userId } }),
    );
    await tx.verification.deleteMany({
      where: { value: userId, identifier: { startsWith: "dayplan-deletion:" } },
    });
  });
}
