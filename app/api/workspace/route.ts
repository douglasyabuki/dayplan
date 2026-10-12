import {
  accountResponse,
  accountSnapshot,
  expectedRevision,
  readAccountBody,
} from "@/lib/account-api";
import {
  loadAccountWorkspace,
  saveAccountWorkspace,
  WorkspaceAccessError,
} from "@/lib/workspace/server";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return accountResponse(request, loadAccountWorkspace);
}

export async function PUT(request: Request): Promise<Response> {
  return accountResponse(request, async (userId) => {
    const body = await readAccountBody(request, [
      "snapshot",
      "expectedRevision",
      "operationId",
    ]);
    if (
      typeof body.operationId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        body.operationId,
      )
    )
      throw new WorkspaceAccessError(
        400,
        "invalid_input",
        "A UUID save operation ID is required.",
      );
    return saveAccountWorkspace(userId, {
      snapshot: accountSnapshot(body.snapshot),
      operationId: body.operationId,
      expectedRevision: expectedRevision(body.expectedRevision),
    });
  });
}
