import { accountResponse, readAccountBody } from "@/lib/account-api";
import { getPrisma } from "@/lib/prisma";
import { WorkspaceAccessError } from "@/lib/workspace/server";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  return accountResponse(request, async (_userId, context) => context.profile);
}

export async function PATCH(request: Request): Promise<Response> {
  return accountResponse(request, async (userId) => {
    const body = await readAccountBody(request, ["name"]);
    if (
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.trim().length > 120
    )
      throw new WorkspaceAccessError(
        400,
        "invalid_input",
        "Enter a name of 1 to 120 characters.",
      );
    await getPrisma().user.update({
      where: { id: userId },
      data: { name: body.name.trim() },
    });
    return { saved: true };
  });
}
