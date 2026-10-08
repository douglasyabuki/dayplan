"use client";

import { ArrowRight, FolderOpen, Plus, Tag } from "lucide-react";
import Link from "next/link";

import { useWorkspaceController } from "@/contexts/workspace-controller";
import { type CollectionKind, workspaceHref } from "@/lib/tasks/routes";

export function WorkspaceCollectionView({ kind }: { kind: CollectionKind }) {
  const { state, setEntity } = useWorkspaceController();
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {state[kind].map((item) => (
        <Link
          href={workspaceHref({ view: kind, selectedId: item.id })}
          className="hover:bg-muted/40 [&_p]:text-muted-foreground relative flex min-h-40 flex-col items-start gap-3 rounded-xl border p-5 transition-colors [&_h2]:text-sm [&_h2]:font-medium [&_p]:text-xs"
          key={item.id}
        >
          <span
            className="flex size-9 items-center justify-center rounded-lg text-(--entity-color) [background:color-mix(in_oklch,var(--entity-color)_10%,transparent)] [&_svg]:size-4"
            data-color={item.color}
          >
            {kind === "projects" ? <FolderOpen /> : <Tag />}
          </span>
          <h2>{item.name}</h2>
          <p>
            {
              state.tasks.filter(
                (t) =>
                  !t.archived &&
                  !t.completed &&
                  (kind === "projects"
                    ? t.projectId === item.id
                    : t.tagIds.includes(item.id)),
              ).length
            }{" "}
            open tasks
          </p>
          <ArrowRight className="text-muted-foreground absolute right-5 bottom-5 size-4" />
        </Link>
      ))}
      <button
        className="hover:bg-muted/40 text-muted-foreground relative flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-5 text-sm transition-colors"
        onClick={() => setEntity({ kind: kind })}
      >
        <Plus />
        <span>Create {kind === "projects" ? "project" : "tag"}</span>
      </button>
    </div>
  );
}
