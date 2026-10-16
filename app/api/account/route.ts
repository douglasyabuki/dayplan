import { getCookies } from "better-auth/cookies";
import { NextResponse } from "next/server";

import { accountResponse, readAccountBody } from "@/lib/account-api";
import {
  assertValidDeletionSession,
  deleteAccount,
  deletionCapability,
  resumeAccountDeletion,
  settleAccountDeletion,
} from "@/lib/account-deletion";
import { getAuth } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";
import { WorkspaceAccessError } from "@/lib/workspace/server";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return accountResponse(request, async (userId, context) => {
    const body = await readAccountBody(request, ["resume", "checkOnly"]);
    if (
      (body.checkOnly !== undefined && body.checkOnly !== true) ||
      (body.checkOnly && body.resume)
    )
      throw new WorkspaceAccessError(
        400,
        "invalid_input",
        "Invalid deletion check.",
      );
    if (body.resume !== undefined && body.resume !== true)
      throw new WorkspaceAccessError(
        400,
        "invalid_input",
        "The resume request is invalid.",
      );
    if (body.resume === true) {
      await resumeAccountDeletion(userId, context.sessionId);
      return { resumed: true };
    }
    assertValidDeletionSession(
      await getPrisma().session.findFirst({
        where: { id: context.sessionId, userId },
      }),
    );
    // Eligibility must not create/cancel intents or pause account editing.
    if (body.checkOnly === true) return { eligible: true };
    return { capability: await deletionCapability(userId, context.sessionId) };
  });
}

export async function DELETE(request: Request): Promise<Response> {
  const response = await accountResponse(request, async (userId, context) => {
    const body = await readAccountBody(request, ["confirmation"]);
    if (body.confirmation !== "DELETE")
      throw new WorkspaceAccessError(
        400,
        "confirmation_required",
        "Type DELETE to confirm permanent deletion.",
      );
    await deleteAccount(
      userId,
      context.sessionId,
      request.headers.get("X-Dayplan-Deletion") ?? "",
    );
    return { deleted: true };
  });
  if (response.ok) {
    const result = new NextResponse(response.body, {
      status: response.status,
      headers: response.headers,
    });
    const context = await getAuth().$context;
    const cookies = [
      ...Object.values(getCookies(getAuth().options)),
      context.createAuthCookie("state"),
      context.createAuthCookie("oauth_state"),
    ];
    for (const cookie of cookies) {
      result.cookies.set(cookie.name, "", {
        ...cookie.attributes,
        sameSite: "lax",
        maxAge: 0,
      });
      for (const entry of (request.headers.get("Cookie") ?? "").split(";")) {
        const name = entry.trim().split("=")[0];
        if (name.startsWith(`${cookie.name}.`))
          result.cookies.set(name, "", {
            ...cookie.attributes,
            sameSite: "lax",
            maxAge: 0,
          });
      }
    }
    return result;
  }
  return response;
}

export async function PATCH(request: Request): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  try {
    if (
      request.headers.get("Origin") !==
      new URL(process.env.BETTER_AUTH_URL!).origin
    )
      return Response.json(
        { message: "The request origin is not allowed." },
        { status: 403, headers },
      );
    return Response.json(
      await settleAccountDeletion(request.headers.get("X-Dayplan-Deletion")),
      { headers },
    );
  } catch (error) {
    return Response.json(
      {
        code:
          error instanceof WorkspaceAccessError ? error.code : "storage_error",
        message:
          error instanceof WorkspaceAccessError
            ? error.message
            : "Deletion could not be confirmed. Please retry checking.",
      },
      {
        status: error instanceof WorkspaceAccessError ? error.status : 503,
        headers,
      },
    );
  }
}
