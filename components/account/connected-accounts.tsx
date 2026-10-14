"use client";

import {
  Check,
  Link,
  LoaderCircle,
  LogIn,
  RefreshCw,
  Unlink,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthOptions } from "@/hooks/account/use-auth-options";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage, parseAuthProvider } from "@/lib/auth-feedback";
import { safeWorkspaceDestination } from "@/lib/workspace/entry";
import { useSessionActions } from "@/stores/session/provider";
import {
  type AuthProvider,
  authProviders,
  providerNames,
} from "@/types-and-constants/auth";

import { ProviderIcon } from "./provider-icon";

type ConnectedAccount = { id: string; providerId: string };
const resultKeys = [
  "settings",
  "connection",
  "provider",
  "error",
  "error_description",
];

function connectionDestination(
  result?: "success" | "error",
  provider?: AuthProvider,
) {
  const url = new URL(
    safeWorkspaceDestination(
      window.location.pathname + window.location.search + window.location.hash,
      window.location.origin,
    ),
    window.location.origin,
  );
  resultKeys.forEach((key) => url.searchParams.delete(key));
  url.searchParams.set("settings", "account");
  if (result) url.searchParams.set("connection", result);
  if (provider) url.searchParams.set("provider", provider);
  return url.pathname + url.search + url.hash;
}

export function ConnectedAccounts({
  beforeDeparture,
}: {
  beforeDeparture: () => Promise<boolean>;
}) {
  const actions = useSessionActions();
  const availability = useAuthOptions();
  const [accounts, setAccounts] = useState<ConnectedAccount[] | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reauthenticate, setReauthenticate] = useState(false);
  const [pending, setPending] = useState<AuthProvider | null>(null);
  const [confirmation, setConfirmation] = useState<AuthProvider | null>(null);
  const [attempt, setAttempt] = useState(0);
  const active = useRef(false);
  const locked = useRef(false);
  const resultConsumed = useRef(false);
  const [result] = useState(() => {
    const params = new URLSearchParams(
      typeof window === "undefined" ? "" : window.location.search,
    );
    return {
      status: params.get("connection"),
      provider: parseAuthProvider(params.get("provider")),
      code: params.get("error"),
    };
  });
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await authClient.listAccounts();
        if (cancelled) return;
        if (response.error || !response.data) {
          setReauthenticate(response.error?.status === 401);
          throw new Error(
            "Connected accounts could not be loaded. Please retry or sign in again.",
          );
        }
        setAccounts(response.data);
        setReauthenticate(false);
        if (!resultConsumed.current && result.status && result.provider) {
          resultConsumed.current = true;
          if (
            result.status === "success" &&
            !result.code &&
            response.data.some(
              (account) => account.providerId === result.provider,
            )
          ) {
            const names = authProviders
              .filter((provider) =>
                response.data.some(
                  (account) => account.providerId === provider,
                ),
              )
              .map((provider) => providerNames[provider]);
            setMessage(
              `${providerNames[result.provider]} connected. You can now sign in with ${names.join(" or ")}.`,
            );
          } else {
            setReauthenticate(
              result.code === "unauthorized" ||
                result.code === "session_not_fresh",
            );
            setError(
              result.status === "error" || result.code
                ? authErrorMessage(result.code, result.provider)
                : "The connection could not be confirmed. Please retry.",
            );
          }
        }
        const url = new URL(window.location.href);
        if (url.searchParams.get("settings") === "account") {
          resultKeys.forEach((key) => url.searchParams.delete(key));
          window.history.replaceState(
            window.history.state,
            "",
            url.pathname + url.search + url.hash,
          );
        }
      } catch (cause) {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "Connected accounts could not be loaded. Please retry.",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, result]);

  async function connect(provider: AuthProvider) {
    if (locked.current || !actions) return;
    locked.current = true;
    setPending(provider);
    setError("");
    setMessage("");
    try {
      if (!(await beforeDeparture())) return;
      await actions.connect(
        provider,
        connectionDestination("success", provider),
        connectionDestination("error", provider),
        beforeDeparture,
      );
    } finally {
      locked.current = false;
      if (active.current) setPending(null);
    }
  }

  async function disconnect(provider: AuthProvider) {
    const account = accounts?.find((entry) => entry.providerId === provider);
    if (!account || locked.current) return;
    locked.current = true;
    setPending(provider);
    setError("");
    setMessage("");
    try {
      const response = await authClient.unlinkAccount({
        accountId: account.id,
      });
      if (!active.current) return;
      if (response.error) {
        setReauthenticate(
          response.error.status === 401 ||
            response.error.code === "SESSION_NOT_FRESH",
        );
        setError(authErrorMessage(response.error.code ?? null, provider));
        return;
      }
      setMessage(`${providerNames[provider]} disconnected.`);
      setAccounts(null);
      setAttempt((value) => value + 1);
    } catch {
      if (active.current)
        setError("The account could not be disconnected. Please retry.");
    } finally {
      locked.current = false;
      if (active.current) setPending(null);
    }
  }

  return (
    <section
      aria-labelledby="connected-accounts-title"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1">
        <h3 id="connected-accounts-title" className="text-sm font-medium">
          Connected accounts
        </h3>
        <p className="text-muted-foreground text-sm">
          Connect another sign-in method to use the same Dayplan account.
        </p>
      </div>
      {!accounts && !error && (
        <p role="status" className="text-muted-foreground text-sm">
          Loading connected accounts…
        </p>
      )}
      {authProviders.map((provider) => {
        const connected = accounts?.some(
          (account) => account.providerId === provider,
        );
        const last = connected && accounts?.length === 1;
        return (
          <div
            key={provider}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <ProviderIcon provider={provider} className="size-5 shrink-0" />
              <div>
                <p className="font-medium">{providerNames[provider]}</p>
                <p className="text-muted-foreground text-xs">
                  {accounts
                    ? connected
                      ? "Connected"
                      : "Not connected"
                    : "Checking…"}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              disabled={
                !accounts ||
                !!pending ||
                actions?.busy ||
                !actions ||
                (!connected && !availability.options?.[provider]) ||
                last
              }
              aria-label={`${connected ? "Disconnect" : "Connect"} ${providerNames[provider]}`}
              aria-describedby={last ? "last-account-help" : undefined}
              onClick={() =>
                connected ? setConfirmation(provider) : void connect(provider)
              }
            >
              {pending === provider ? (
                <LoaderCircle
                  data-icon="inline-start"
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : connected ? (
                <Unlink data-icon="inline-start" aria-hidden="true" />
              ) : (
                <Link data-icon="inline-start" aria-hidden="true" />
              )}
              {pending === provider
                ? "Working…"
                : connected
                  ? "Disconnect"
                  : "Connect"}
            </Button>
            {!connected &&
              availability.options &&
              !availability.options[provider] && (
                <p className="text-muted-foreground w-full text-xs">
                  {providerNames[provider]} connections aren’t available yet.
                </p>
              )}
          </div>
        );
      })}
      {accounts?.length === 1 && (
        <p id="last-account-help" className="text-muted-foreground text-xs">
          Keep at least one sign-in method connected.
        </p>
      )}
      {message && (
        <p role="status" className="text-muted-foreground text-sm">
          {message}
        </p>
      )}
      {(error || availability.error || actions?.requiresReauthentication) && (
        <Alert variant="destructive">
          <AlertDescription>
            {error ||
              (actions?.requiresReauthentication
                ? "Please sign in again before connecting another account."
                : "Sign-in options could not be loaded.")}
          </AlertDescription>
          <Button
            variant="outline"
            disabled={!!pending}
            onClick={() => {
              setError("");
              setAttempt((value) => value + 1);
              availability.retry();
            }}
          >
            <RefreshCw data-icon="inline-start" aria-hidden="true" />
            Retry connected accounts
          </Button>
          {(reauthenticate || actions?.requiresReauthentication) && (
            <Button
              variant="outline"
              onClick={() =>
                void (async () => {
                  if (await beforeDeparture())
                    await actions?.switchAccount(
                      connectionDestination(),
                      beforeDeparture,
                    );
                })()
              }
            >
              <LogIn data-icon="inline-start" aria-hidden="true" />
              Sign in again
            </Button>
          )}
        </Alert>
      )}
      <Dialog
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Disconnect {confirmation && providerNames[confirmation]}?
            </DialogTitle>
            <DialogDescription>
              Your Dayplan account and workspace will remain available through
              your other connected sign-in method.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmation(null)}>
              <X data-icon="inline-start" aria-hidden="true" />
              Cancel
            </Button>
            <Button
              onClick={() => {
                const provider = confirmation;
                setConfirmation(null);
                if (provider) void disconnect(provider);
              }}
            >
              <Check data-icon="inline-start" aria-hidden="true" />
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
