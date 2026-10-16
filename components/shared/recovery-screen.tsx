"use client";

import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
} from "@/components/ui/empty";

export function RecoveryScreen({
  title,
  description,
  retry,
  reference,
  collection,
  broad = false,
}: {
  title: string;
  description: string;
  retry?: () => void;
  reference?: string;
  collection?: "projects" | "tags";
  broad?: boolean;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    document.title = `${title} — Dayplan`;
  }, [title]);
  return (
    <Empty className="min-h-64 overflow-y-auto">
      <EmptyHeader>
        <h1
          ref={heading}
          tabIndex={-1}
          className="text-xl font-semibold outline-none"
        >
          {title}
        </h1>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {reference && /^[a-zA-Z0-9_-]{1,100}$/.test(reference) && (
          <p>Error reference: {reference}</p>
        )}
        {retry && <Button onClick={retry}>Try again</Button>}
        {collection && (
          <a href={`/${collection}`} className="underline">
            Back to {collection}
          </a>
        )}
        <a href="/today" className="underline">
          Back to Today
        </a>
        {broad && (
          <a href="/welcome" className="underline">
            Welcome
          </a>
        )}
        <a href="/help" className="underline">
          Help and contact
        </a>
      </EmptyContent>
    </Empty>
  );
}
