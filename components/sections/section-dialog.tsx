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
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkspace } from "@/stores/workspace/provider";
import type { Section } from "@/types-and-constants/sections";
export function SectionDialog({
  projectId,
  section,
  mode,
  placement,
  close,
}: {
  projectId: string | null;
  section?: Section;
  mode?: "rename" | "delete";
  placement?: { relativeTo: string; side: "left" | "right" };
  close: () => void;
}) {
  const { state, act } = useWorkspace();
  const [name, setName] = useState(section?.name ?? "");
  const [deleting, setDeleting] = useState(mode === "delete");
  const [deleteTasks, setDeleteTasks] = useState(false);
  const [destination, setDestination] = useState("");
  const sections = state.sections
    .filter((s) => s.projectId === projectId && s.id !== section?.id)
    .sort((a, b) => a.order - b.order);
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
            {deleting
              ? `Delete ${section?.name}?`
              : section
                ? mode === "rename"
                  ? "Rename section"
                  : "Manage section"
                : "Add section"}
          </DialogTitle>
          <DialogDescription>
            {deleting
              ? "This includes completed, archived, and filtered-out tasks. Deleting a recurring series also deletes its occurrences. You can undo this action."
              : "Keep related tasks together in List and Kanban views."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (deleting && section) {
              act(
                {
                  type: "deleteSection",
                  id: section.id,
                  destination: destination || null,
                  deleteTasks,
                },
                "Section deleted",
              );
            } else {
              if (!name.trim()) return;
              const id = section?.id ?? crypto.randomUUID();
              const updated: Section = {
                id,
                name: name.trim(),
                projectId,
                order:
                  section?.order ??
                  Math.max(-1, ...sections.map((s) => s.order)) + 1,
              };
              if (placement) {
                const ids = sections.map((item) => item.id);
                const relativeIndex = ids.indexOf(placement.relativeTo);
                if (relativeIndex < 0) return;
                ids.splice(
                  relativeIndex + (placement.side === "right" ? 1 : 0),
                  0,
                  id,
                );
                act(
                  {
                    type: "batch",
                    actions: [
                      { type: "section", section: updated },
                      { type: "reorderSections", projectId, ids },
                    ],
                  },
                  "Section added",
                );
              } else {
                act(
                  { type: "section", section: updated },
                  section ? "Section renamed" : "Section added",
                );
              }
            }
            close();
          }}
        >
          <FieldGroup>
            {deleting ? (
              <FieldSet>
                <FieldLegend>Tasks in this section</FieldLegend>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="radio"
                    name="section-deletion"
                    checked={deleteTasks}
                    onChange={() => setDeleteTasks(true)}
                  />
                  Delete the section and tasks
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="radio"
                    name="section-deletion"
                    checked={!deleteTasks}
                    onChange={() => setDeleteTasks(false)}
                  />
                  Delete the section and move tasks to…
                </label>
                {!deleteTasks && (
                  <Field>
                    <FieldLabel htmlFor="section-destination">
                      Destination section
                    </FieldLabel>
                    <Select
                      items={[
                        { value: "", label: "Unsectioned" },
                        ...sections.map((s) => ({
                          value: s.id,
                          label: s.name,
                        })),
                      ]}
                      value={destination}
                      onValueChange={(value) =>
                        value !== null && setDestination(value)
                      }
                    >
                      <SelectTrigger
                        id="section-destination"
                        className="h-8 w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="">Unsectioned</SelectItem>
                          {sections.map((s) => (
                            <SelectItem value={s.id} key={s.id}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </FieldSet>
            ) : (
              <Field>
                <FieldLabel htmlFor="section-name">Section name</FieldLabel>
                <Input
                  id="section-name"
                  autoFocus
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. In progress"
                />
              </Field>
            )}
          </FieldGroup>
          <DialogFooter className="mt-6">
            {section && !deleting && mode !== "rename" && (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setDeleting(true)}
              >
                Delete section
              </Button>
            )}
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={deleting ? "destructive" : "default"}
              disabled={!deleting && !name.trim()}
            >
              {deleting ? "Delete" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
