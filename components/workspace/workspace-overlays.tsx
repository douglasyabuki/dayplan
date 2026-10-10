"use client";

import { DragOverlay } from "@dnd-kit/react";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";

import { ProjectDialog } from "@/components/projects/project-dialog";
import { SectionDialog } from "@/components/sections/section-dialog";
import { SettingsDialog } from "@/components/settings/settings-dialog";
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
import { useWorkspaceController } from "@/contexts/workspace-controller";

export function WorkspaceOverlays() {
  const router = useRouter();
  const {
    state,
    dragSnapshot,
    settings,
    setSettings,
    settingsReturnFocus,
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
      {settings && (
        <SettingsDialog
          initialPanel={settings}
          returnFocus={settingsReturnFocus}
          onClose={() => setSettings(null)}
        />
      )}
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
