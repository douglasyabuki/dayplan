"use client";

import { type ReactNode, useMemo } from "react";

import { AuthControls, SessionError } from "@/components/account/auth-controls";
import { ErrorScreen } from "@/components/shared/error-screen";
import {
  guestProfileDataSource,
  type ProfileDataSource,
} from "@/stores/account/persistence";
import { AccountProvider } from "@/stores/account/provider";
import {
  guestOwner,
  ownerKey,
  type WorkspaceOwner,
} from "@/stores/session/model";
import { useSession } from "@/stores/session/provider";
import { accountDataSources } from "@/stores/workspace/account-data-source";
import type { WorkspaceDataSource } from "@/stores/workspace/data-source";
import { guestWorkspaceDataSource } from "@/stores/workspace/persistence";
import { WorkspaceProvider } from "@/stores/workspace/provider";

import { WorkspaceLoading } from "./workspace-loading";

export type OwnerDataSources = {
  workspace: WorkspaceDataSource;
  profile: ProfileDataSource;
};
const guestSources: OwnerDataSources = {
  workspace: guestWorkspaceDataSource,
  profile: guestProfileDataSource,
};

// Resolvers must reuse immutable adapters for returning owners; their shared lanes
// keep a new load behind writes from an earlier provider lifetime.
export function WorkspaceOwnerBoundary({
  children,
  resolveDataSources,
}: {
  children: ReactNode;
  resolveDataSources?: (owner: WorkspaceOwner) => OwnerDataSources | null;
}) {
  const session = useSession();
  const key =
    session.status === "authenticated"
      ? `account:${session.userId}:${session.sessionId ?? "injected"}`
      : session.status;
  const sources = useMemo(() => {
    if (session.status === "loading" || session.status === "error") return null;
    const owner: WorkspaceOwner =
      session.status === "guest"
        ? guestOwner
        : { kind: "account", userId: session.userId };
    const resolved = resolveDataSources
      ? resolveDataSources(owner)
      : owner.kind === "guest"
        ? guestSources
        : session.status === "authenticated" && session.sessionId
          ? accountDataSources(session.userId, session.sessionId)
          : null;
    if (
      resolved &&
      (ownerKey(resolved.workspace.owner) !== ownerKey(owner) ||
        ownerKey(resolved.profile.owner) !== ownerKey(owner))
    ) {
      throw new Error("Data source ownership does not match the session");
    }
    return resolved;
  }, [session, resolveDataSources]);
  if (session.status === "loading") return <WorkspaceLoading />;
  if (session.status === "error")
    return <SessionError message={session.message} />;
  if (!sources)
    return (
      <div className="flex flex-col gap-3 p-6">
        <ErrorScreen
          title="Account workspace access could not be verified"
          description="Retry loading or sign in again to restore account access. Your account data has not been replaced with guest data."
          retry={() => window.location.reload()}
          broad
        />
        <AuthControls authenticated />
      </div>
    );
  return (
    <AccountProvider key={key} dataSource={sources.profile}>
      <WorkspaceProvider dataSource={sources.workspace}>
        {children}
      </WorkspaceProvider>
    </AccountProvider>
  );
}
