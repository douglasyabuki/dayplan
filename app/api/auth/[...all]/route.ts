import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/lib/auth";

export const runtime = "nodejs";

async function handle(request: Request): Promise<Response> {
  try {
    const handlers = toNextJsHandler(getAuth());
    const response = await (request.method === "GET"
      ? handlers.GET(request)
      : handlers.POST(request));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return Response.json(
      { message: "Authentication is temporarily unavailable. Please retry." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const GET = handle;
export const POST = handle;
