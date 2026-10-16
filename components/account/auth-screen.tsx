"use client";

import {
  ArrowLeft,
  LoaderCircle,
  RefreshCw,
  Sunrise,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSyncExternalStore } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuthOptions } from "@/hooks/account/use-auth-options";
import { authErrorMessage, parseAuthProvider } from "@/lib/auth-feedback";
import { useSessionActions } from "@/stores/session/provider";
import { authProviders, providerNames } from "@/types-and-constants/auth";

import { ProviderIcon } from "./provider-icon";

const subscribe = () => () => {};

export function AuthScreen({ mode }: { mode: "sign-in" | "sign-up" }) {
  // Keep the server-rendered button disabled until its click handler is ready.
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const params = useSearchParams();
  const signingUp = mode === "sign-up";
  const actions = useSessionActions();
  const availability = useAuthOptions();
  const next = params.get("next");
  const query = next ? { next } : {};

  const error =
    actions?.error ||
    (params.has("authError") || params.has("error")
      ? authErrorMessage(
          params.get("error"),
          parseAuthProvider(params.get("provider")),
        )
      : "");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6 sm:px-10">
        <Link
          href={{ pathname: "/welcome", query }}
          className="flex items-center gap-2.5 text-xl font-semibold tracking-tight"
          aria-label="Dayplan home"
        >
          <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-xl">
            <Sunrise className="size-5" aria-hidden="true" />
          </span>
          <span>
            Dayplan<span className="text-primary">.</span>
          </span>
        </Link>
        <Link
          href={{ pathname: "/welcome", query }}
          className={buttonVariants({ variant: "ghost" })}
        >
          <ArrowLeft data-icon="inline-start" aria-hidden="true" />
          Back to welcome
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 pt-8 pb-16">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>
              <h1>{signingUp ? "Create your account" : "Welcome back"}</h1>
            </CardTitle>
            <CardDescription>
              {signingUp
                ? "Make room for what matters with Dayplan."
                : "Sign in to your Dayplan account."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              {authProviders.map((provider) => {
                const pending = actions?.pendingAction?.provider === provider;
                return (
                  <div key={provider} className="flex flex-col gap-1.5">
                    <Button
                      type="button"
                      size="lg"
                      variant="outline"
                      className="w-full"
                      disabled={
                        !hydrated ||
                        !actions ||
                        actions.busy ||
                        !availability.options?.[provider]
                      }
                      aria-busy={pending}
                      aria-describedby={
                        availability.options && !availability.options[provider]
                          ? `${provider}-unavailable`
                          : undefined
                      }
                      onClick={() =>
                        void actions?.signIn(provider, next ?? undefined)
                      }
                    >
                      {pending ? (
                        <LoaderCircle
                          data-icon="inline-start"
                          className="animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <ProviderIcon
                          provider={provider}
                          data-icon="inline-start"
                        />
                      )}
                      {pending
                        ? `Connecting to ${providerNames[provider]}…`
                        : `Continue with ${providerNames[provider]}`}
                    </Button>
                    {availability.options &&
                      !availability.options[provider] && (
                        <p
                          id={`${provider}-unavailable`}
                          className="text-muted-foreground text-xs"
                        >
                          {providerNames[provider]} sign-in isn’t available yet.
                        </p>
                      )}
                  </div>
                );
              })}
            </div>
            {availability.error && (
              <Alert variant="destructive">
                <AlertDescription>
                  Sign-in options could not be loaded.
                </AlertDescription>
                <Button variant="outline" onClick={availability.retry}>
                  <RefreshCw data-icon="inline-start" aria-hidden="true" />
                  Retry sign-in options
                </Button>
              </Alert>
            )}
            <p className="text-muted-foreground text-sm">
              Use Google or GitHub. No Dayplan password needed.
            </p>
            {error && (
              <Alert variant="destructive" aria-label="Sign-in error">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">
              {signingUp ? "Already have an account?" : "New to Dayplan?"}{" "}
              <Link
                className="text-primary underline underline-offset-4"
                href={{ pathname: signingUp ? "/sign-in" : "/sign-up", query }}
              >
                {signingUp ? "Sign in" : "Sign up"}
              </Link>
            </p>
            <Link
              href={{ pathname: "/welcome", query }}
              className={buttonVariants({ variant: "link" })}
            >
              <UserRound data-icon="inline-start" aria-hidden="true" />
              Explore as a guest
            </Link>
          </CardFooter>
          <div className="px-6 pb-6">
            <Link href="/help" className="text-sm underline">
              Help and contact
            </Link>
          </div>
        </Card>
      </main>
    </div>
  );
}
