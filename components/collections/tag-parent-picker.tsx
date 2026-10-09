"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useWorkspaceController } from "@/contexts/workspace-controller";

export function TagParentPicker({
  value,
  onChange,
  excludeId,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  excludeId?: string;
}) {
  const { tags } = useWorkspaceController();
  const [query, setQuery] = useState("");
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>Parent tag</FieldLabel>
      <Input
        id={id}
        placeholder="Search parent tags"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <FieldDescription>
        Selected: {value === null ? "Top level" : tags.path(value)}
      </FieldDescription>
      <div
        className="flex max-h-48 flex-col gap-1 overflow-y-auto"
        role="group"
        aria-label="Parent tag options"
      >
        <Button
          type="button"
          variant={value === null ? "secondary" : "ghost"}
          aria-pressed={value === null}
          onClick={() => onChange(null)}
        >
          Top level
        </Button>
        {tags.rows
          .filter(
            ({ tag }) =>
              (!excludeId || !tags.contains(excludeId, tag.id)) &&
              tags
                .path(tag.id)
                .toLowerCase()
                .includes(query.toLowerCase().trim()),
          )
          .map(({ tag }) => (
            <Button
              key={tag.id}
              type="button"
              variant={value === tag.id ? "secondary" : "ghost"}
              className="justify-start"
              aria-pressed={value === tag.id}
              title={tags.path(tag.id)}
              onClick={() => onChange(tag.id)}
            >
              <span className="truncate">{tags.path(tag.id)}</span>
            </Button>
          ))}
      </div>
    </Field>
  );
}
