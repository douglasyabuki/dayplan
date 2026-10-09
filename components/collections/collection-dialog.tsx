"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useWorkspace } from "@/contexts/workspace";
import { useWorkspaceController } from "@/contexts/workspace-controller";
import { type CollectionDialogState, colors } from "@/lib/tasks/types";

import { TagParentPicker } from "./tag-parent-picker";

export function CollectionDialog(
  props: CollectionDialogState & { close: () => void },
) {
  const { kind, entity, close } = props;
  const { act, confirm, operationError } = useWorkspace();
  const { tagExpansion, view, selectedId } = useWorkspaceController();
  const router = useRouter();
  const moving = props.kind === "tags" && props.mode === "move";
  const [parentId, setParentId] = useState<string | null>(
    props.kind === "tags"
      ? (props.entity?.parentId ?? props.parentId ?? null)
      : null,
  );
  const [name, setName] = useState(entity?.name ?? "");
  const [color, setColor] = useState(entity?.color ?? "indigo");
  const label = kind === "projects" ? "project" : "tag";
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {moving ? "Move" : entity ? "Edit" : "New"} {label}
          </DialogTitle>
          <DialogDescription>
            {kind === "projects"
              ? "A home for things that belong together."
              : "A simple way to connect tasks across projects."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const fields = {
              id: entity?.id ?? crypto.randomUUID(),
              name: name.trim(),
              color,
            };
            const success = act(
              props.kind === "tags"
                ? moving && props.entity
                  ? { type: "moveTag", id: props.entity.id, parentId }
                  : {
                      type: "entity",
                      kind: "tags",
                      entity: {
                        ...fields,
                        parentId,
                        order: props.entity?.order ?? 0,
                      },
                    }
                : { type: "entity", kind: "projects", entity: fields },
              `${label[0].toUpperCase() + label.slice(1)} saved`,
            );
            if (success) {
              if (kind === "tags") tagExpansion.reveal(parentId);
              close();
            }
          }}
        >
          <FieldGroup>
            {!moving && (
              <Field>
                <FieldLabel htmlFor="entity-name">Name</FieldLabel>
                <Input
                  id="entity-name"
                  autoFocus
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
            )}
            {kind === "tags" && (
              <TagParentPicker
                value={parentId}
                onChange={setParentId}
                excludeId={entity?.id}
              />
            )}
            {!moving && (
              <Field>
                <FieldLabel>Color</FieldLabel>
                <ToggleGroup
                  aria-label="Color"
                  value={[color]}
                  onValueChange={(values) => {
                    if (values[0]) setColor(String(values[0]));
                  }}
                >
                  {colors.map((c) => (
                    <ToggleGroupItem key={c} value={c} aria-label={c}>
                      <span
                        className="inline-block size-4 shrink-0 rounded-full [background:var(--entity-color,var(--primary))]"
                        data-color={c}
                      />
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
            )}
            {operationError && (
              <p role="alert" className="text-destructive text-sm">
                {operationError}
              </p>
            )}
            <DialogFooter>
              {entity && !moving && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() =>
                    confirm({
                      title: `Delete ${label}?`,
                      description:
                        kind === "projects"
                          ? "Tasks in this project will move to Inbox."
                          : "This tag will be removed from all tasks. Its subtags will move to its parent, keeping their descendants and task assignments.",
                      action: () => {
                        const success = act(
                          { type: "deleteEntity", kind, id: entity.id },
                          `${label} deleted`,
                        );
                        if (success) {
                          if (
                            kind === "tags" &&
                            view === "tags" &&
                            selectedId === entity.id
                          )
                            router.push("/tags");
                          close();
                        }
                      },
                    })
                  }
                >
                  Delete
                </Button>
              )}
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button type="submit">
                {moving ? "Move" : "Save"} {label}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
