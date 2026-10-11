"use client";

import {
  ArrowDown,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Circle,
  FolderKanban,
  Inbox,
  Laptop,
  Sun,
  Sunrise,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { safeWorkspaceDestination } from "@/lib/workspace/entry";
import { useOnboarding } from "@/stores/onboarding/provider";
import { useSession } from "@/stores/session/provider";

const features = [
  {
    icon: Inbox,
    title: "A place for every idea",
    description:
      "Capture tasks in your Inbox as they come to mind. Give them a priority, add a deadline, and find your next step.",
    detail: "Less to remember. More room to think.",
  },
  {
    icon: FolderKanban,
    title: "Bring your projects together",
    description:
      "Organize work and life with projects, sections, and tags. Switch between lists and boards to see things your way.",
    detail: "From the big picture to the little details.",
  },
  {
    icon: CalendarDays,
    title: "Make a plan for your time",
    description:
      "Focus on what matters in Today, then give tasks a place in your calendar. Plan by day, week, or month.",
    detail: "A little structure for the day ahead.",
  },
];

export function Welcome() {
  const router = useRouter();
  const params = useSearchParams();
  const session = useSession();
  const { ready, continueAsGuest, storageError } = useOnboarding();

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6 sm:px-10">
        <div className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
          <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-xl">
            <Sunrise className="size-5" aria-hidden="true" />
          </span>
          <span>
            Dayplan<span className="text-primary">.</span>
          </span>
        </div>
        <a
          href="#features"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 rounded-md py-2 text-sm transition-colors"
        >
          See what you can do
          <ArrowDown className="size-4" aria-hidden="true" />
        </a>
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
            <div className="flex w-full max-w-md flex-col items-start gap-4 pt-2">
              <Button
                size="lg"
                className="w-full sm:w-auto"
                disabled={!ready || session.status === "loading"}
                onClick={() => {
                  const next = safeWorkspaceDestination(
                    params.get("next"),
                    window.location.origin,
                  );
                  continueAsGuest();
                  router.replace(next);
                }}
              >
                Continue without an account
                <ArrowRight data-icon="inline-end" aria-hidden="true" />
              </Button>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Start as a guest with the full workspace. Your data stays in
                this browser; it is not saved to an account or synced across
                devices.
              </p>
              {storageError && (
                <Alert>
                  <AlertDescription>
                    Browser storage is unavailable. You can still continue; your
                    work will stay in this session.
                  </AlertDescription>
                </Alert>
              )}
            </div>
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
                A simple start. More to come.
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Dayplan is ready to use as a guest. Account creation and sign-in
                are coming later.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button variant="outline" disabled>
                Create an account — Coming later
              </Button>
              <Button variant="outline" disabled>
                Sign in — Coming later
              </Button>
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
