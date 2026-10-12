"use client";

import { ArrowLeft, Sunrise } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

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
import { useSessionActions } from "@/stores/session/provider";

export function AuthScreen({ mode }: { mode: "sign-in" | "sign-up" }) {
  const params = useSearchParams();
  const signingUp = mode === "sign-up";
  const actions = useSessionActions();
  const next = params.get("next");
  const query = next ? { next } : {};

  const error =
    actions?.error ||
    (params.has("authError") || params.has("error")
      ? "Google sign-in was not completed. Please try again."
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
            <Button
              type="button"
              size="lg"
              className="w-full"
              disabled={!actions || actions.busy}
              aria-busy={actions?.busy}
              onClick={() => void actions?.signIn(next ?? undefined)}
            >
              {actions?.busy ? "Connecting to Google…" : "Continue with Google"}
            </Button>
            <p className="text-muted-foreground text-sm">
              {signingUp
                ? "Create your Dayplan account with your Google account."
                : "Use your Google account to sign in to Dayplan."}
            </p>
            {error && (
              <Alert variant="destructive" aria-label="Google sign-in error">
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
              Explore as a guest
            </Link>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}
