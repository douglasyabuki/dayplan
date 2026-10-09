"use client";
import { useRouter } from "next/navigation";

import { ProjectDialog } from "@/components/projects/project-dialog";
import { TagDialog } from "@/components/tags/tag-dialog";
import type { CollectionDialogState } from "@/components/workspace/collection-dialog-state";
import { useWorkspaceController } from "@/contexts/workspace-controller";
export function CollectionDialog(
  props: CollectionDialogState & { close: () => void },
) {
  const { tagExpansion, view, selectedId } = useWorkspaceController();
  const router = useRouter();
  return props.kind === "projects" ? (
    <ProjectDialog entity={props.entity} close={props.close} />
  ) : (
    <TagDialog
      {...props}
      reveal={tagExpansion.reveal}
      onDeleted={(id) => {
        if (view === "tags" && selectedId === id) router.push("/tags");
      }}
    />
  );
}
