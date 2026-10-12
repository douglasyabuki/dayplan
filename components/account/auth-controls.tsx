"use client";

import {
  LogIn,
  LogOut,
  RefreshCw,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { useSessionActions } from "@/stores/session/provider";

export function AuthControls({
  authenticated = false,
  destination,
}: {
  authenticated?: boolean;
  destination?: string;
}) {
  const actions = useSessionActions();
  if (!actions) return null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {authenticated ? (
          <>
            <Button
              variant="outline"
              disabled={actions.busy}
              onClick={() => void actions.switchAccount(destination)}
            >
              <UsersRound data-icon="inline-start" aria-hidden="true" />
              Switch Google account
            </Button>
            <Button
              variant="outline"
              disabled={actions.busy}
              onClick={() => void actions.signOut()}
            >
              <LogOut data-icon="inline-start" aria-hidden="true" />
              Sign out
            </Button>
          </>
        ) : (
          <>
            <a
              className={buttonVariants({ variant: "outline" })}
              href={
                destination
                  ? `/sign-in?next=${encodeURIComponent(destination)}`
                  : "/sign-in"
              }
            >
              <LogIn data-icon="inline-start" aria-hidden="true" />
              Sign in
            </a>
            <a
              className={buttonVariants()}
              href={
                destination
                  ? `/sign-up?next=${encodeURIComponent(destination)}`
                  : "/sign-up"
              }
            >
              <UserRoundPlus data-icon="inline-start" aria-hidden="true" />
              Sign up
            </a>
          </>
        )}
      </div>
      {actions.error && (
        <Alert variant="destructive">
          <AlertDescription>{actions.error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export function SessionError({ message }: { message: string }) {
  const actions = useSessionActions();
  return (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
      <Button
        variant="outline"
        disabled={actions?.busy}
        onClick={() => void actions?.retry()}
      >
        <RefreshCw data-icon="inline-start" aria-hidden="true" />
        Retry session
      </Button>
    </Alert>
  );
}
