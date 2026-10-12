export type Session =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "error"; message: string }
  | { status: "authenticated"; userId: string; sessionId?: string };

export type WorkspaceOwner =
  { kind: "guest" } | { kind: "account"; userId: string };

export function ownerKey(owner: WorkspaceOwner): string {
  return owner.kind === "guest" ? "guest" : `account:${owner.userId}`;
}

export const guestOwner: WorkspaceOwner = { kind: "guest" };
