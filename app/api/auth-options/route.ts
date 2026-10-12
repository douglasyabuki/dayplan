import { googleSignInConfigured } from "@/lib/auth";

export function GET(): Response {
  return Response.json(
    { google: googleSignInConfigured() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
