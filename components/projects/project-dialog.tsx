"use client";
import { NameColorDialog } from "@/components/shared/name-color-dialog";
import { useWorkspace } from "@/stores/workspace/provider";
import type { Project } from "@/types-and-constants/projects";
export function ProjectDialog({
  entity,
  close,
}: {
  entity?: Project;
  close: () => void;
}) {
  const { act, confirm, operationError } = useWorkspace();
  return (
    <NameColorDialog
      entity={entity}
      label="project"
      description="A home for things that belong together."
      operationError={operationError}
      close={close}
      onSave={(name, color) => {
        if (
          act(
            {
              type: "entity",
              kind: "projects",
              entity: { id: entity?.id ?? crypto.randomUUID(), name, color },
            },
            "Project saved",
          )
        )
          close();
      }}
      onDelete={
        entity
          ? () =>
              confirm({
                title: "Delete project?",
                description: "Tasks in this project will move to Inbox.",
                action: () => {
                  if (
                    act(
                      { type: "deleteEntity", kind: "projects", id: entity.id },
                      "project deleted",
                    )
                  )
                    close();
                },
              })
          : undefined
      }
    />
  );
}
