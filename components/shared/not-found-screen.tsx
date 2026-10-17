"use client";

import { ArrowLeft, ArrowUpRight, Sunrise } from "lucide-react";
import { useEffect, useRef } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
} from "@/components/ui/empty";

export function NotFoundScreen({
  title,
  description,
  collection,
  broad = false,
}: {
  title: string;
  description: string;
  collection?: "projects" | "tags";
  broad?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    document.title = `${title} — Dayplan`;
  }, [title]);

  return (
    <Empty className="mx-auto my-auto max-w-xl gap-6 rounded-none px-6 py-12 sm:py-16">
      <div aria-hidden="true" className="relative mb-2 w-52 pt-3">
        <div className="bg-accent/50 absolute inset-x-3 top-0 bottom-2 rounded-2xl" />
        <Card className="border-border relative gap-0 rounded-2xl border py-0 ring-0">
          <CardHeader className="flex flex-row items-center justify-between border-b py-3">
            <div className="flex items-center gap-2">
              <Sunrise className="text-primary size-4" />
              <span className="text-xs font-medium">
                Dayplan<span className="text-primary">.</span>
              </span>
            </div>
            <span className="bg-muted size-1.5 rounded-full" />
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3 py-6">
            <span className="text-primary/70 text-6xl leading-none font-medium tracking-tight">
              404
            </span>
            <div className="flex items-center gap-1.5">
              <span className="bg-border h-1 w-6 rounded-full" />
              <span className="bg-accent h-1 w-10 rounded-full" />
              <span className="bg-border h-1 w-6 rounded-full" />
            </div>
          </CardContent>
        </Card>
      </div>

      <EmptyHeader className="max-w-md gap-3">
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-2xl font-semibold tracking-tight text-pretty outline-none"
        >
          {title}
        </h1>
        <EmptyDescription className="max-w-sm text-sm leading-relaxed text-pretty">
          {description}
        </EmptyDescription>
      </EmptyHeader>

      <EmptyContent className="max-w-md gap-5">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <a href="/today" className={buttonVariants()}>
            <ArrowLeft data-icon="inline-start" />
            Back to Today
          </a>
          {collection && (
            <a
              href={`/${collection}`}
              className={buttonVariants({ variant: "outline" })}
            >
              Back to {collection}
              <ArrowUpRight data-icon="inline-end" />
            </a>
          )}
        </div>
        <div className="text-muted-foreground flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs">
          <a
            href="/help"
            className="hover:text-foreground focus-visible:ring-ring rounded-sm underline-offset-4 transition-colors hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            Help and contact
          </a>
          {broad && (
            <a
              href="/welcome"
              className="hover:text-foreground focus-visible:ring-ring rounded-sm underline-offset-4 transition-colors hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              Welcome
            </a>
          )}
        </div>
      </EmptyContent>
    </Empty>
  );
}
