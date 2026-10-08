import { Tag as TagIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { Tag } from "@/lib/tasks/types";
import { cn } from "@/lib/utils";

export function TagBadge({
  tag,
  compact = false,
}: {
  tag: Tag;
  compact?: boolean;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "min-w-0",
        compact
          ? "text-muted-foreground h-4.5 shrink gap-0.5 px-1 py-0 text-[11px] font-normal has-data-[icon=inline-start]:pl-1"
          : "max-w-full",
      )}
      title={tag.name}
    >
      <TagIcon
        data-icon="inline-start"
        className="tag-icon shrink-0 text-(--entity-color) opacity-75"
        data-color={tag.color}
        aria-hidden="true"
      />
      <span className="truncate">{tag.name}</span>
    </Badge>
  );
}
