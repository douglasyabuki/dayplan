"use client";

import { DragOverlay } from "@dnd-kit/react";
import { Check } from "lucide-react";

import { CollectionDialog } from "@/components/collections/collection-dialog";
import { TaskDragSnapshot } from "@/components/tasks/task-drag-feedback";
import { TaskEditor } from "@/components/tasks/task-editor";
import { SectionDialog } from "@/components/tasks/task-sections";
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
  const {
    state,
    dragSnapshot,
    act,
    reset,
    settings,
    setSettings,
    entity,
    setEntity,
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
      {entity && (
        <CollectionDialog
          key={entity.entity?.id ?? entity.kind}
          {...entity}
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
