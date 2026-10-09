"use client";
import type { ReactNode } from "react";
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
import { colors } from "@/types-and-constants/collections";
type Props = {
  entity?: { name: string; color: string };
  label: string;
  description: string;
  moving?: boolean;
  children?: ReactNode;
  operationError: string;
  onSave: (name: string, color: string) => void;
  onDelete?: () => void;
  close: () => void;
};
export function NameColorDialog({
  entity,
  label,
  description,
  moving = false,
  children,
  operationError,
  onSave,
  onDelete,
  close,
}: Props) {
  const [name, setName] = useState(entity?.name ?? "");
  const [color, setColor] = useState(entity?.color ?? "indigo");
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
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onSave(name.trim(), color);
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
            {children}
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
              {onDelete && !moving && (
                <Button type="button" variant="destructive" onClick={onDelete}>
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
