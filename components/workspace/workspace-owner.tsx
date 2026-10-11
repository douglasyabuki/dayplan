"use client";

import { type ReactNode, useMemo } from "react";

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
      ? `account:${session.userId}`
      : session.status;
  const sources = useMemo(() => {
    if (session.status === "loading") return null;
    const owner: WorkspaceOwner =
      session.status === "guest"
        ? guestOwner
        : { kind: "account", userId: session.userId };
    const resolved = resolveDataSources
      ? resolveDataSources(owner)
      : owner.kind === "guest"
        ? guestSources
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
  if (!sources)
    return <p role="alert">Account workspace access is not available yet.</p>;
  return (
    <AccountProvider key={key} dataSource={sources.profile}>
      <WorkspaceProvider dataSource={sources.workspace}>
        {children}
      </WorkspaceProvider>
    </AccountProvider>
  );
}
