"use client";

import { ArrowUpRight, Sunrise } from "lucide-react";

import { Button } from "@/components/ui/button";

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
    </div>
  );
}
