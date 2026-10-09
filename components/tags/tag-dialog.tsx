"use client";
import { useState } from "react";

import { NameColorDialog } from "@/components/shared/name-color-dialog";
import { TagParentPicker } from "@/components/tags/tag-parent-picker";
import { useWorkspace } from "@/stores/workspace/provider";
import type { Tag } from "@/types-and-constants/tags";
type Props = {
  entity?: Tag;
  parentId?: string | null;
  mode?: "move";
  close: () => void;
  reveal: (id: string | null) => void;
  onDeleted: (id: string) => void;
};
export function TagDialog(props: Props) {
  const { entity, close, reveal, onDeleted } = props;
  const { act, confirm, operationError } = useWorkspace();
  const moving = props.mode === "move";
  const [parentId, setParentId] = useState<string | null>(
    entity?.parentId ?? props.parentId ?? null,
  );
  return (
    <NameColorDialog
      entity={entity}
      label="tag"
      description="A simple way to connect tasks across projects."
      moving={moving}
      operationError={operationError}
      close={close}
      onSave={(name, color) => {
        const success = act(
          moving && entity
            ? { type: "moveTag", id: entity.id, parentId }
            : {
                type: "entity",
                kind: "tags",
                entity: {
                  id: entity?.id ?? crypto.randomUUID(),
                  name,
                  color,
                  parentId,
                  order: entity?.order ?? 0,
                },
              },
          "Tag saved",
        );
        if (success) {
          reveal(parentId);
          close();
        }
      }}
      onDelete={
        entity
          ? () =>
              confirm({
                title: "Delete tag?",
                description:
                  "This tag will be removed from all tasks. Its subtags will move to its parent, keeping their descendants and task assignments.",
                action: () => {
                  if (
                    act(
                      { type: "deleteEntity", kind: "tags", id: entity.id },
                      "tag deleted",
                    )
                  ) {
                    onDeleted(entity.id);
                    close();
                  }
                },
              })
          : undefined
      }
    >
      <TagParentPicker
        value={parentId}
        onChange={setParentId}
        excludeId={entity?.id}
      />
    </NameColorDialog>
  );
}
