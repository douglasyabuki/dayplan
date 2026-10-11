"use client";

import { CheckIcon, HashIcon } from "lucide-react";
import { useId, useState } from "react";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
  const matchingTags = tags.rows.filter(
    ({ tag }) =>
      (!excludeId || !tags.contains(excludeId, tag.id)) &&
      tags.path(tag.id).toLowerCase().includes(query.toLowerCase().trim()),
  );
  return (
    <Field>
      <FieldLabel htmlFor={id}>Parent tag</FieldLabel>
      <FieldDescription id={`${id}-help`}>
        Choose a tag to nest this one under, or select Top level for no parent.
      </FieldDescription>
      <FieldDescription aria-live="polite">
        Selected: {value === null ? "Top level (no parent)" : tags.path(value)}
      </FieldDescription>
      <Input
        id={id}
        placeholder="Search parent tags"
        aria-describedby={`${id}-help`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ToggleGroup
        className="max-h-48 w-full flex-wrap overflow-y-auto"
        aria-label="Parent tag options"
        variant="outline"
        size="sm"
        value={[value === null ? "top-level" : `tag:${value}`]}
        onValueChange={(values) => {
          const selected = values[0];
          if (typeof selected === "string") {
            onChange(selected === "top-level" ? null : selected.slice(4));
          }
        }}
      >
        <ToggleGroupItem
          type="button"
          value="top-level"
          className="rounded-4xl"
        >
          Top level
          {value === null && (
            <CheckIcon data-icon="inline-end" aria-hidden="true" />
          )}
        </ToggleGroupItem>
        {matchingTags.map(({ tag }) => (
          <ToggleGroupItem
            key={tag.id}
            type="button"
            value={`tag:${tag.id}`}
            className="max-w-full rounded-4xl"
            title={tags.path(tag.id)}
          >
            <HashIcon
              data-icon="inline-start"
              className="tag-icon text-(--entity-color)"
              data-color={tag.color}
              aria-hidden="true"
            />
            <span className="truncate">{tags.path(tag.id)}</span>
            {value === tag.id && (
              <CheckIcon data-icon="inline-end" aria-hidden="true" />
            )}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {query.trim() && matchingTags.length === 0 && (
        <FieldDescription role="status">
          No matching tags. Try another search or choose Top level.
        </FieldDescription>
      )}
    </Field>
  );
}
