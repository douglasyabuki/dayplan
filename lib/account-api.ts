import "server-only";

import {
  requireAccountSession,
  SessionAccessError,
} from "@/lib/server-session";
import { WorkspaceAccessError } from "@/lib/workspace/server";
import { validateWorkspace } from "@/stores/workspace/validation";
import type { Workspace } from "@/types-and-constants/workspace";

/**
 * Runs an authenticated operation and returns a sanitized, uncached response.
 * @param request Incoming same-origin account request.
 * @param operation Operation receiving ownership from the verified session.
 * @returns {Promise<Response>} JSON success or a sanitized error with a stable code.
 * @example accountResponse(request, userId => loadAccountWorkspace(userId));
 */
export async function accountResponse(
  request: Request,
  operation: (userId: string) => Promise<unknown>,
): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  try {
    const { userId } = await requireAccountSession(request);
    return Response.json(await operation(userId), { headers });
  } catch (error) {
    if (error instanceof SessionAccessError)
      return Response.json(
        {
          code: error.status === 401 ? "unauthorized" : "session_mismatch",
          message: error.message,
        },
        { status: error.status, headers },
      );
    if (error instanceof WorkspaceAccessError)
      return Response.json(
        { code: error.code, message: error.message },
        { status: error.status, headers },
      );
    return Response.json(
      {
        code: "storage_error",
        message:
          "Account storage is unavailable. Your local edits have been kept.",
      },
      { status: 503, headers },
    );
  }
}

/**
 * Parses a bounded object request and rejects unexpected ownership or other fields.
 * @param request Request to read once.
 * @param fields Permitted top-level field names.
 * @returns {Promise<Record<string, unknown>>} Parsed JSON object; throws a 400 error for malformed input.
 * @example await readAccountBody(request, ["snapshot", "expectedRevision"]);
 */
export async function readAccountBody(
  request: Request,
  fields: string[],
): Promise<Record<string, unknown>> {
  try {
    const text = await request.text();
    if (text.length > 5_000_000) throw new Error();
    const value: unknown = JSON.parse(text);
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).some((k) => !fields.includes(k))
    )
      throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new WorkspaceAccessError(
      400,
      "invalid_input",
      "The request body is invalid.",
    );
  }
}

/**
 * Validates an incoming workspace without modifying caller objects.
 * @param value Untrusted browser JSON.
 * @returns {Workspace} Validated version-2 snapshot; throws a 400 error when invalid.
 * @example accountSnapshot(body.snapshot);
 */
export function accountSnapshot(value: unknown): Workspace {
  try {
    return validateWorkspace(structuredClone(value));
  } catch {
    throw new WorkspaceAccessError(
      400,
      "invalid_input",
      "The workspace contains invalid data.",
    );
  }
}

/**
 * Validates an expected database revision.
 * @param value Untrusted revision.
 * @returns {number} A nonnegative integer revision below PostgreSQL's integer limit.
 * @example expectedRevision(body.expectedRevision);
 */
export function expectedRevision(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value >= 2_147_483_647
  )
    throw new WorkspaceAccessError(
      400,
      "invalid_input",
      "A valid revision is required.",
    );
  return value;
}
