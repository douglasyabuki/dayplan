import {
  accountResponse,
  accountSnapshot,
  readAccountBody,
} from "@/lib/account-api";
import { previewGuestImport } from "@/lib/workspace/server";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return accountResponse(request, async (userId) => {
    const body = await readAccountBody(request, ["snapshot"]);
    return previewGuestImport(userId, accountSnapshot(body.snapshot));
  });
}
