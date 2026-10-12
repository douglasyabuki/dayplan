import {
  accountResponse,
  accountSnapshot,
  expectedRevision,
  readAccountBody,
} from "@/lib/account-api";
import {
  importGuestWorkspace,
  WorkspaceAccessError,
} from "@/lib/workspace/server";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return accountResponse(request, async (userId) => {
    const body = await readAccountBody(request, [
      "snapshot",
      "expectedRevision",
      "confirmedHistoryToken",
    ]);
    if (typeof body.confirmedHistoryToken !== "string")
      throw new WorkspaceAccessError(
        400,
        "invalid_input",
        "Preview and confirm the import first.",
      );
    return importGuestWorkspace(userId, {
      snapshot: accountSnapshot(body.snapshot),
      expectedRevision: expectedRevision(body.expectedRevision),
      confirmedHistoryToken: body.confirmedHistoryToken,
    });
  });
}
