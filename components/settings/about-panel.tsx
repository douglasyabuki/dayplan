"use client";

import { ArrowUpRight, Sunrise } from "lucide-react";

import { Button } from "@/components/ui/button";
import { features } from "@/components/welcome/features";

export function AboutPanel() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-3">
        <span className="bg-primary text-primary-foreground flex size-12 items-center justify-center rounded-xl">
          <Sunrise aria-hidden="true" />
        </span>
        <h3 className="text-sm font-medium">
          Dayplan<span className="text-primary">.</span>
        </h3>
        <p className="text-muted-foreground text-sm leading-normal">
          Plan your day, organize tasks, and make time for what matters.
        </p>
        <Button
          variant="outline"
          nativeButton={false}
          role="link"
          render={
            <a
              href="https://github.com/douglasyabuki/dayplan"
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          View source on GitHub
          <ArrowUpRight data-icon="inline-end" />
        </Button>
      </div>
      <a href="/help" className="underline">
        Help and contact
      </a>
      <section aria-label="Getting started" className="flex flex-col gap-4">
        <h3 className="text-sm font-medium">Getting started</h3>
        {features.map(({ title, description }) => (
          <div key={title} className="flex flex-col gap-1">
            <h4 className="text-sm font-medium">{title}</h4>
            <p className="text-muted-foreground text-sm leading-normal">
              {description}
            </p>
          </div>
        ))}
        <p className="text-muted-foreground text-sm leading-normal">
          Guest plans stay in this browser. When you sign in, you can import or
          discard guest data in Data settings.
        </p>
      </section>
    </div>
  );
}
