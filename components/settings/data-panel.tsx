"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useWorkspace } from "@/stores/workspace/provider";

export function DataPanel({ onReset }: { onReset: () => void }) {
  const { state } = useWorkspace();
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Your workspace</h3>
        <p className="text-muted-foreground text-sm leading-normal">
          Your workspace is saved in this browser.
          <br />
          Timezone: {state.timezone.replaceAll("_", " ")}
        </p>
      </div>
      <Separator />
      <div className="flex flex-col items-start gap-2">
        <h3 className="text-sm font-medium">Reset workspace</h3>
        <p className="text-muted-foreground text-sm leading-normal">
          Replace your tasks, projects, and tags with fresh sample data. Your
          account profile is kept. You will be asked to confirm before
          resetting.
        </p>
        <Button variant="outline" onClick={onReset}>
          Reset to sample data
        </Button>
      </div>
    </div>
  );
}
