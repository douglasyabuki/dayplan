import { contentKey } from "@/stores/workspace/draft-guard";
import type { Workspace } from "@/types-and-constants/workspace";

type Content = Pick<
  Workspace,
  "tasks" | "projects" | "tags" | "sections" | "exceptions"
>;

type Entry = { id: number; before: Content; after: Content };

export function workspaceContent(state: Workspace): Content {
  const { tasks, projects, tags, sections, exceptions } = state;
  return { tasks, projects, tags, sections, exceptions };
}

/** Provider-local timeline. Snapshots share immutable domain data, never UI settings. */
export class WorkspaceHistory {
  private entries: Entry[] = [];
  private cursor = 0;
  private sequence = 0;
  generation = 0;

  get canUndo() {
    return this.cursor > 0;
  }

  get canRedo() {
    return this.cursor < this.entries.length;
  }

  get undoId() {
    return this.entries[this.cursor - 1]?.id;
  }

  record(before: Workspace, after: Workspace): number | undefined {
    const previous = workspaceContent(before);
    const next = workspaceContent(after);
    if (
      Object.keys(previous).every(
        (key) => previous[key as keyof Content] === next[key as keyof Content],
      ) ||
      contentKey(previous) === contentKey(next)
    )
      return;
    const entry = { id: ++this.sequence, before: previous, after: next };
    this.entries = [...this.entries.slice(0, this.cursor), entry].slice(-20);
    this.cursor = this.entries.length;
    return entry.id;
  }

  undo(state: Workspace): Workspace | null {
    if (!this.canUndo) return null;
    return { ...state, ...this.entries[--this.cursor].before };
  }

  redo(state: Workspace): Workspace | null {
    if (!this.canRedo) return null;
    return { ...state, ...this.entries[this.cursor++].after };
  }

  clear() {
    this.entries = [];
    this.cursor = 0;
    this.generation += 1;
  }
}
