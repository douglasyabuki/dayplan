"use client";

import {
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  Circle,
  Laptop,
  Sun,
  Sunrise,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { AuthControls, SessionError } from "@/components/account/auth-controls";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { features } from "@/components/welcome/features";
import { WorkspaceLoading } from "@/components/workspace/workspace-loading";
import { safeWorkspaceDestination } from "@/lib/workspace/entry";
import { useOnboarding } from "@/stores/onboarding/provider";
import { useSession } from "@/stores/session/provider";

export function Welcome() {
  const router = useRouter();
  const params = useSearchParams();
  const session = useSession();
  const { ready, continueAsGuest, storageError } = useOnboarding();
  const authenticated = session.status === "authenticated";
  const destination = params.get("next") ?? undefined;

  useEffect(() => {
    if (authenticated) {
      router.replace(
        safeWorkspaceDestination(destination ?? null, window.location.origin),
      );
    }
  }, [authenticated, destination, router]);

  if (session.status === "loading" || authenticated)
    return <WorkspaceLoading />;

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 sm:gap-4 sm:px-10">
        <div className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
          <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-xl">
            <Sunrise className="size-5" aria-hidden="true" />
          </span>
          <span>
            Dayplan<span className="text-primary">.</span>
          </span>
        </div>
        <nav aria-label="Account">
          <AuthControls authenticated={false} destination={destination} />
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-20 px-6 pt-10 pb-16 sm:px-10 sm:pt-16 lg:gap-24">
        <section
          aria-labelledby="welcome-heading"
          className="grid items-center gap-12 lg:grid-cols-2 lg:gap-14"
        >
          <div className="flex min-w-0 flex-col items-start gap-6">
            <h1
              id="welcome-heading"
              className="text-primary text-sm font-medium"
            >
              Welcome to Dayplan
            </h1>
            <p className="max-w-lg text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Make room for
              <br />
              <span className="text-primary">what matters.</span>
            </p>
            <p className="text-muted-foreground max-w-md text-base leading-relaxed text-pretty sm:text-lg">
              Your tasks, projects, and everyday plans, together in one
              thoughtful space. Clear your mind, find your focus, and shape the
              day ahead.
            </p>
            <div className="flex w-full max-w-md flex-col gap-4 pt-2">
              <div className="flex flex-col gap-3 sm:flex-row">
                <a
                  className={buttonVariants({
                    size: "lg",
                    className: "w-full sm:w-auto sm:min-w-32",
                  })}
                  href={
                    destination
                      ? `/sign-up?next=${encodeURIComponent(destination)}`
                      : "/sign-up"
                  }
                >
                  Sign up
                  <ArrowRight data-icon="inline-end" aria-hidden="true" />
                </a>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={!ready || session.status === "error"}
                  onClick={() => {
                    const next = safeWorkspaceDestination(
                      params.get("next"),
                      window.location.origin,
                    );
                    if (session.status === "guest") continueAsGuest();
                    router.replace(next);
                  }}
                >
                  Continue without an account
                </Button>
              </div>
              <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
                Just exploring? The full workspace is yours to try. Guest plans
                stay in this browser and don’t sync across devices.
              </p>
              {session.status === "error" && (
                <SessionError message={session.message} />
              )}
              {params.get("authError") && (
                <Alert variant="destructive">
                  <AlertDescription>
                    Google sign-in was cancelled or failed. Please try again.
                  </AlertDescription>
                </Alert>
              )}
              {storageError && (
                <Alert>
                  <AlertDescription>
                    Browser storage is unavailable. You can still continue; your
                    work will stay in this session.
                  </AlertDescription>
                </Alert>
              )}
            </div>
            <a
              href="#features"
              className={buttonVariants({ variant: "link", className: "px-0" })}
            >
              See what you can do
              <ArrowDown data-icon="inline-end" aria-hidden="true" />
            </a>
          </div>
          <WorkspacePreview />
        </section>

        <section
          id="features"
          aria-labelledby="features-heading"
          className="flex scroll-mt-8 flex-col gap-8"
        >
          <div className="flex flex-col gap-3">
            <h2
              id="features-heading"
              className="text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              From a busy mind to a clearer day.
            </h2>
            <p className="text-muted-foreground max-w-xl leading-relaxed">
              Whether it’s a work project, a personal goal, or the everyday
              things, Dayplan helps you turn what’s on your mind into a plan.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {features.map(({ icon: Icon, title, description, detail }) => (
              <Card key={title}>
                <CardHeader className="gap-4">
                  <span className="bg-accent text-accent-foreground flex size-10 items-center justify-center rounded-xl">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <CardTitle>
                    <h3>{title}</h3>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1">
                  <p className="text-muted-foreground leading-relaxed">
                    {description}
                  </p>
                </CardContent>
                <CardFooter>
                  <p className="text-muted-foreground text-sm">{detail}</p>
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="account-heading"
          className="flex flex-col gap-6"
        >
          <Separator />
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
            <div className="flex max-w-md flex-col gap-2">
              <h2 id="account-heading" className="font-medium">
                Your workspace, your choice.
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Start as a guest in this browser, sign in to your account, or
                sign up for a fresh start.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <AuthControls
                authenticated={false}
                destination={params.get("next") ?? undefined}
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function WorkspacePreview() {
  return (
    <figure className="bg-accent/50 flex min-w-0 flex-col gap-4 rounded-3xl p-4 sm:p-6">
      <figcaption className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
        <Laptop className="size-4" aria-hidden="true" />
        Workspace preview
      </figcaption>
      <Card className="shadow-primary/5 shadow-lg">
        <CardHeader className="gap-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>
              <h2 className="flex items-center gap-2">
                <Sun className="text-primary size-5" aria-hidden="true" />
                Today
              </h2>
            </CardTitle>
            <Badge variant="secondary">Your daily focus</Badge>
          </div>
          <CardDescription>Small steps. Meaningful progress.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <ul className="flex flex-col gap-4" aria-label="Example tasks">
            {[
              { title: "Outline the next big idea", project: "Studio" },
              { title: "Make time for a walk", project: "Personal" },
              { title: "Plan the week ahead", project: "Everyday" },
            ].map(({ title, project }) => (
              <li key={title} className="flex items-start gap-3">
                <Circle
                  className="text-muted-foreground mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="font-medium">{title}</p>
                  <p className="text-muted-foreground text-xs">{project}</p>
                </div>
              </li>
            ))}
          </ul>
          <Separator />
          <div className="flex flex-col gap-3">
            <h3 className="text-muted-foreground text-xs font-medium">
              A little space in your day
            </h3>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-xs">
              <dt className="text-muted-foreground">09:00</dt>
              <dd className="border-primary bg-accent text-accent-foreground rounded-lg border-l-2 px-3 py-3">
                Focus time · Outline the next big idea
              </dd>
              <dt className="text-muted-foreground">12:30</dt>
              <dd className="border-border bg-muted rounded-lg border-l-2 px-3 py-3">
                Take a break · Make time for a walk
              </dd>
            </dl>
          </div>
        </CardContent>
        <CardFooter className="gap-2">
          <CheckCircle2
            className="text-primary size-4 shrink-0"
            aria-hidden="true"
          />
          <p className="text-muted-foreground text-xs">
            A plan that leaves room for life.
          </p>
        </CardFooter>
      </Card>
    </figure>
  );
}
