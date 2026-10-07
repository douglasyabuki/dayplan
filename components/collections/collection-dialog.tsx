"use client";

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
import { colors, type Project } from "@/lib/tasks/types";

export function CollectionDialog({
  kind,
  entity,
  close,
}: {
  kind: "projects" | "tags";
  entity?: Project;
  close: () => void;
}) {
  const { act, confirm } = useWorkspace();
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
            {entity ? "Edit" : "New"} {label}
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
            act(
              {
                type: "entity",
                kind,
                entity: {
                  id: entity?.id ?? crypto.randomUUID(),
                  name: name.trim(),
                  color,
                },
              },
              `${label[0].toUpperCase() + label.slice(1)} saved`,
            );
            close();
          }}
        >
          <FieldGroup>
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
            <DialogFooter>
              {entity && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() =>
                    confirm({
                      title: `Delete ${label}?`,
                      description:
                        kind === "projects"
                          ? "Tasks in this project will move to Inbox."
                          : "This tag will be removed from all tasks.",
                      action: () => {
                        act(
                          { type: "deleteEntity", kind, id: entity.id },
                          `${label} deleted`,
                        );
                        close();
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
              <Button type="submit">Save {label}</Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
