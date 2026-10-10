"use client";

import { DragOverlay } from "@dnd-kit/react";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";

import { ProjectDialog } from "@/components/projects/project-dialog";
import { SectionDialog } from "@/components/sections/section-dialog";
import { TagDialog } from "@/components/tags/tag-dialog";
import { TaskEditor } from "@/components/tasks/editor/task-editor";
import { TaskDragSnapshot } from "@/components/tasks/task-drag-feedback";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useWorkspaceController } from "@/contexts/workspace-controller";

export function WorkspaceOverlays() {
  const router = useRouter();
  const {
    state,
    dragSnapshot,
    act,
    reset,
    settings,
    setSettings,
    entity,
    setEntity,
    tagExpansion,
    view,
    selectedId,
    sectionDialog,
    setSectionDialog,
    projectId,
    newDraft,
    allTasks,
    selectedTaskId,
    fallbackNewTask,
    selectedTask,
    closeEditor,
  } = useWorkspaceController();
  return (
    <>
      {selectedTaskId === "new" ? (
        <TaskEditor
          key={newDraft?.id ?? "new"}
          task={newDraft ?? fallbackNewTask}
          isNew
          close={closeEditor}
        />
      ) : (
        selectedTask && (
          <TaskEditor
            key={selectedTask.id}
            task={selectedTask}
            isNew={false}
            close={closeEditor}
          />
        )
      )}
      {selectedTaskId && selectedTaskId !== "new" && !selectedTask && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) closeEditor();
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Task not found</DialogTitle>
              <DialogDescription>
                This task may have been deleted. Your other tasks are still
                available.
              </DialogDescription>
            </DialogHeader>
            <Button onClick={closeEditor}>Back to tasks</Button>
          </DialogContent>
        </Dialog>
      )}
      {sectionDialog && (
        <SectionDialog
          projectId={projectId}
          section={sectionDialog.section}
          mode={sectionDialog.mode}
          placement={sectionDialog.placement}
          close={() => setSectionDialog(null)}
        />
      )}
      {entity?.kind === "projects" && (
        <ProjectDialog
          key={entity.entity?.id ?? entity.kind}
          entity={entity.entity}
          close={() => setEntity(null)}
        />
      )}
      {entity?.kind === "tags" && (
        <TagDialog
          key={entity.entity?.id ?? entity.kind}
          {...entity}
          reveal={tagExpansion.reveal}
          onDeleted={(id) => {
            if (view === "tags" && selectedId === id) router.push("/tags");
          }}
          close={() => setEntity(null)}
        />
      )}
      <Dialog open={settings} onOpenChange={setSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your workspace</DialogTitle>
            <DialogDescription>
              A little space that feels like you.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>Appearance</FieldLabel>
              <ToggleGroup
                value={[state.theme]}
                onValueChange={(values) => {
                  if (values[0])
                    act({
                      type: "theme",
                      theme: values[0] as typeof state.theme,
                    });
                }}
                variant="outline"
              >
                {["system", "light", "dark"].map((t) => (
                  <ToggleGroupItem key={t} value={t} className="capitalize">
                    {t}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <p className="text-muted-foreground text-sm">
              Timezone: {state.timezone.replaceAll("_", " ")}
              <br />
              Your workspace is saved in this browser.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSettings(false);
                reset();
              }}
            >
              Reset to sample data
            </Button>
          </FieldGroup>
        </DialogContent>
      </Dialog>
      <DragOverlay dropAnimation={null}>
        {(source) =>
          dragSnapshot ? (
            <TaskDragSnapshot snapshot={dragSnapshot} />
          ) : (
            <div className="border-primary bg-popover flex max-w-80 items-center gap-2 rounded-lg border px-4 py-3 text-xs shadow-xl">
              <Check className="size-4" />
              {source.data.kind === "section"
                ? state.sections.find((s) => s.id === source.data.sectionId)
                    ?.name
                : (allTasks.find((t) => t.id === source.data.taskId)?.title ??
                  "Move task")}
            </div>
          )
        }
      </DragOverlay>
    </>
  );
}
