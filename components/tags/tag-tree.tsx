"use client";

import { CollisionPriority, CollisionType } from "@dnd-kit/abstract";
import { RestrictToVerticalAxis } from "@dnd-kit/abstract/modifiers";
import {
  type CollisionDetector,
  pointerIntersection,
} from "@dnd-kit/collision";
import { Feedback } from "@dnd-kit/dom";
import {
  DragDropProvider,
  type DragEndEvent,
  type DragMoveEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
} from "@dnd-kit/react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Folder,
  MoreHorizontal,
  Pencil,
  Plus,
  Tag as TagIcon,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuAction, SidebarMenuBadge } from "@/components/ui/sidebar";
import { useWorkspaceController } from "@/contexts/workspace-controller";
import { tagIndex } from "@/lib/tags/hierarchy";
import { cn } from "@/lib/utils";
import { workspaceHref } from "@/lib/workspace/routes";
import { useWorkspace } from "@/stores/workspace/provider";
import type { Tag } from "@/types-and-constants/tags";
import type { Workspace } from "@/types-and-constants/workspace";

type Destination = {
  id: string;
  parentId: string | null;
  beforeId?: string;
  targetId: string | null;
  intent: "before" | "after" | "inside";
};
const tagSensors = [
  PointerSensor.configure({ preventActivation: () => false }),
  KeyboardSensor,
];
const tagFeedback = [Feedback.configure({ dropAnimation: null })];
const tagModifiers = [RestrictToVerticalAxis];

const TAG_COLLISION_INSET_Y = 2;
const tagRowCollisionDetector: CollisionDetector = ({
  droppable,
  dragOperation,
}) => {
  if (dragOperation.activatorEvent?.type === "keydown")
    return pointerIntersection({ droppable, dragOperation });
  const bounds = droppable.shape?.boundingRectangle;
  const point = dragOperation.position.current;
  if (!bounds || !point) return null;
  const insetY = Math.min(TAG_COLLISION_INSET_Y, bounds.height / 4);
  if (point.y < bounds.top + insetY || point.y > bounds.bottom - insetY)
    return null;
  return {
    id: droppable.id,
    value: 1 / (1 + Math.abs(point.y - (bounds.top + bounds.height / 2))),
    type: CollisionType.PointerIntersection,
    priority: CollisionPriority.High,
  };
};

export function tagDropDestination(
  state: Workspace,
  sourceId: string,
  targetId: string | null,
  intent: Destination["intent"],
): Destination | null {
  const index = tagIndex(state.tags);
  if (
    !index.byId.has(sourceId) ||
    (targetId !== null &&
      (!index.byId.has(targetId) || index.contains(sourceId, targetId)))
  )
    return null;
  const target = targetId === null ? undefined : index.byId.get(targetId);
  const parentId = intent === "inside" ? targetId : (target?.parentId ?? null);
  const siblings = (index.children.get(parentId) ?? []).filter(
    (t) => t.id !== sourceId,
  );
  const position = siblings.findIndex((t) => t.id === targetId);
  return {
    id: sourceId,
    parentId,
    targetId,
    intent,
    beforeId:
      intent === "before"
        ? (targetId ?? undefined)
        : intent === "after"
          ? siblings[position + 1]?.id
          : undefined,
  };
}

export function TagTree({
  close,
  label = "Tags",
}: {
  close?: () => void;
  label?: string;
}) {
  const { state, act } = useWorkspace();
  const { tags, countsByTag, tagExpansion } = useWorkspaceController();
  const [destination, setDestination] = useState<Destination | null>(null);
  const [draggedTagId, setDraggedTagId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const treeRef = useRef<HTMLUListElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const rootTop = useRef(0);
  const dragRows = useRef<{ id: string; top: number; height: number }[]>([]);
  function resolve(event: DragMoveEvent | DragEndEvent) {
    const sourceId = event.operation.source?.data.tagId;
    if (typeof sourceId !== "string") return null;
    const point =
      "to" in event && event.to ? event.to : event.operation.position.current;
    const keyboard = event.operation.activatorEvent?.type === "keydown";
    let targetId: string | null;
    let fraction = 0.5;
    if (keyboard) {
      const target = event.operation.target;
      if (!target) return null;
      targetId = target.data.tagId;
      if (targetId !== null && typeof targetId !== "string") return null;
    } else {
      // Preview reflow must not change the hit regions. Coordinates relative to
      // the list retain the initial row slots while still following scrolling.
      // Match the vertical modifier: pointer X must not change the destination,
      // including when a target row is indented deeper than the source.
      const origin = treeRef.current?.getBoundingClientRect();
      if (!origin) return null;
      const row = dragRows.current.find(
        (row) =>
          point.y >= origin.top + row.top + TAG_COLLISION_INSET_Y &&
          point.y <= origin.top + row.top + row.height - TAG_COLLISION_INSET_Y,
      );
      if (row) {
        targetId = row.id;
        fraction = (point.y - origin.top - row.top) / row.height;
      } else {
        const root = rootRef.current?.getBoundingClientRect();
        if (
          !root ||
          point.y < origin.top + rootTop.current ||
          point.y > origin.top + rootTop.current + root.height
        )
          return null;
        targetId = null;
      }
    }
    const intent =
      targetId === null || event.operation.activatorEvent?.type === "keydown"
        ? "inside"
        : fraction < 0.25
          ? "before"
          : fraction > 0.75
            ? "after"
            : "inside";
    return tagDropDestination(state, sourceId, targetId, intent);
  }
  const depthById = new Map(tags.rows.map(({ tag, depth }) => [tag.id, depth]));
  const draggedTag = draggedTagId ? tags.byId.get(draggedTagId) : undefined;
  const previewDepth =
    destination?.parentId === null
      ? 0
      : (depthById.get(destination?.parentId ?? "") ?? -1) + 1;

  function renderChildren(parentId: string | null) {
    const activeDestination =
      destination?.parentId === parentId ? destination : null;
    const children = (tags.children.get(parentId) ?? []).filter(
      (tag) => tag.id !== draggedTagId || !destination,
    );
    if (!draggedTag || !activeDestination)
      return children.map((tag) => nodes.get(tag.id));
    const preview = (
      <li
        key={`preview:${draggedTag.id}:${parentId ?? "root"}:${activeDestination.beforeId ?? "end"}`}
      >
        <TagRowPreview
          tag={draggedTag}
          depth={previewDepth}
          count={countsByTag.get(draggedTag.id) ?? 0}
        />
      </li>
    );
    const beforeIndex = activeDestination.beforeId
      ? children.findIndex((tag) => tag.id === activeDestination.beforeId)
      : -1;
    const index = beforeIndex < 0 ? children.length : beforeIndex;
    return [
      ...children.slice(0, index).map((tag) => nodes.get(tag.id)),
      preview,
      ...children.slice(index).map((tag) => nodes.get(tag.id)),
    ];
  }

  // Build nested lists iteratively, retaining unlimited logical depth.
  const nodes = new Map<string, ReactNode>();
  for (let i = tags.rows.length - 1; i >= 0; i--) {
    const { tag, depth } = tags.rows[i];
    const children = tags.children.get(tag.id) ?? [];
    nodes.set(
      tag.id,
      <li key={tag.id} className="group/menu-item relative">
        <TagRow
          tag={tag}
          depth={depth}
          close={close}
          destination={destination}
          count={countsByTag.get(tag.id) ?? 0}
        />
        {(children.length > 0 || destination?.parentId === tag.id) &&
          (!tagExpansion.collapsed.has(tag.id) ||
            destination?.parentId === tag.id) && (
            <ul
              aria-label={`${tag.name} subtags`}
              className="flex min-w-0 flex-col gap-0.5"
            >
              {renderChildren(tag.id)}
            </ul>
          )}
      </li>,
    );
  }
  const treeContents = (
    <>
      <ul
        ref={treeRef}
        aria-label={label}
        className="flex min-w-0 flex-col gap-1"
      >
        {renderChildren(null)}
      </ul>
      <RootTarget
        elementRef={rootRef}
        active={dragging}
        highlighted={destination?.targetId === null}
      />
    </>
  );
  return (
    <DragDropProvider
      modifiers={tagModifiers}
      onDragStart={(event) => {
        const tree = treeRef.current;
        const origin = tree?.getBoundingClientRect();
        rootTop.current =
          (rootRef.current?.getBoundingClientRect().top ?? 0) -
          (origin?.top ?? 0);
        dragRows.current =
          tree && origin
            ? Array.from(
                tree.querySelectorAll<HTMLElement>(
                  "[data-tag-row]:not([data-dnd-placeholder])",
                ),
                (element) => {
                  const rect = element.getBoundingClientRect();
                  return {
                    id: element.dataset.tagRow!,
                    top: rect.top - origin.top,
                    height: rect.height,
                  };
                },
              )
            : [];
        const tagId = event.operation.source?.data.tagId;
        setDraggedTagId(typeof tagId === "string" ? tagId : null);
        setDragging(true);
      }}
      onDragMove={(event) => setDestination(resolve(event))}
      onDragOver={(event) => setDestination(resolve(event))}
      onDragEnd={(event) => {
        const next = event.canceled ? null : resolve(event);
        dragRows.current = [];
        setDestination(null);
        setDraggedTagId(null);
        setDragging(false);
        if (
          next &&
          act(
            {
              type: "moveTag",
              id: next.id,
              parentId: next.parentId,
              beforeId: next.beforeId,
            },
            "Tag moved",
          )
        )
          tagExpansion.reveal(next.parentId);
      }}
    >
      {treeContents}
      <span className="sr-only" role="status">
        {destination
          ? `Move tag ${destination.intent} ${destination.targetId ? tags.path(destination.targetId) : "Top level"}`
          : ""}
      </span>
    </DragDropProvider>
  );
}

function RootTarget({
  elementRef,
  active,
  highlighted,
}: {
  elementRef: { current: HTMLDivElement | null };
  active: boolean;
  highlighted: boolean;
}) {
  const id = useId();
  const { ref } = useDroppable({
    id,
    type: "tag-target",
    accept: ["tag"],
    collisionDetector: tagRowCollisionDetector,
    data: { tagId: null },
  });
  return (
    <div
      ref={(element) => {
        ref(element);
        elementRef.current = element;
      }}
      data-tag-root-target
      className={cn(
        "rounded-lg text-center text-xs",
        active ? "min-h-10 border border-dashed p-2" : "h-1",
        highlighted && "bg-accent outline-primary outline",
      )}
    >
      {active && "Move to top level"}
    </div>
  );
}

function TagRow({
  tag,
  depth,
  close,
  destination,
  count,
}: {
  tag: Tag;
  depth: number;
  close?: () => void;
  destination: Destination | null;
  count: number;
}) {
  const { act, confirm } = useWorkspace();
  const { tags, tagExpansion, setEntity, view, selectedId } =
    useWorkspaceController();
  const router = useRouter();
  const id = useId();
  const draggable = useDraggable({
    id: `tag:${id}`,
    type: "tag",
    sensors: tagSensors,
    plugins: tagFeedback,
    data: { tagId: tag.id },
  });
  const droppable = useDroppable({
    id: `tag-target:${id}`,
    type: "tag-target",
    accept: (source) =>
      source.type === "tag" &&
      typeof source.data.tagId === "string" &&
      !tags.contains(source.data.tagId, tag.id),
    collisionDetector: tagRowCollisionDetector,
    data: { tagId: tag.id },
  });
  const children = tags.children.get(tag.id) ?? [];
  const siblings = tags.children.get(tag.parentId) ?? [];
  const position = siblings.findIndex((t) => t.id === tag.id);
  const expanded = !tagExpansion.collapsed.has(tag.id);
  const actions = [
    {
      label: "Create subtag",
      Icon: Plus,
      run: () => setEntity({ kind: "tags", parentId: tag.id }),
    },
    {
      label: "Rename/Edit",
      Icon: Pencil,
      run: () => setEntity({ kind: "tags", entity: tag }),
    },
    {
      label: "Move to",
      Icon: Folder,
      run: () => setEntity({ kind: "tags", entity: tag, mode: "move" }),
    },
    {
      label: "Move up",
      Icon: ArrowUp,
      disabled: position === 0,
      run: () =>
        act(
          {
            type: "moveTag",
            id: tag.id,
            parentId: tag.parentId,
            beforeId: siblings[position - 1]?.id,
          },
          "Tag moved",
        ),
    },
    {
      label: "Move down",
      Icon: ArrowDown,
      disabled: position === siblings.length - 1,
      run: () =>
        act(
          {
            type: "moveTag",
            id: tag.id,
            parentId: tag.parentId,
            beforeId: siblings[position + 2]?.id,
          },
          "Tag moved",
        ),
    },
    {
      label: "Delete",
      Icon: Trash2,
      run: () =>
        confirm({
          title: `Delete ${tag.name}?`,
          description:
            "This tag will be removed from all tasks. Its subtags will move to its parent, keeping their descendants and task assignments.",
          action: () => {
            if (
              act(
                { type: "deleteEntity", kind: "tags", id: tag.id },
                "Tag deleted",
              ) &&
              view === "tags" &&
              selectedId === tag.id
            )
              router.push("/tags");
          },
        }),
    },
  ];
  const active = destination?.targetId === tag.id;
  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div />}>
        <div
          ref={(element) => {
            draggable.ref(element);
            droppable.ref(element);
          }}
          data-tag-row={tag.id}
          data-tag-drop-intent={active ? destination.intent : undefined}
          data-tag-busy={draggable.isDragging || draggable.isDropping}
          className={cn(
            "group/tag-row relative min-h-9 min-w-0 rounded-lg text-[13px]",
            view === "tags" && selectedId === tag.id && "bg-accent",
            draggable.isDragging && "opacity-40",
            active &&
              destination.intent === "inside" &&
              "bg-accent outline-primary outline-2 -outline-offset-2",
          )}
          style={{
            marginInlineStart: Math.min(depth, 6) * 12,
            width: `calc(100% - ${Math.min(depth, 6) * 12}px)`,
          }}
        >
          {children.length > 0 && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute top-1/2 left-0 size-3 -translate-y-1/2 p-0 [&_svg]:size-3"
              aria-label={`${expanded ? "Collapse" : "Expand"} ${tag.name}`}
              aria-expanded={expanded}
              onClick={() => tagExpansion.toggle(tag.id)}
            >
              {expanded ? <ChevronDown /> : <ChevronRight />}
            </Button>
          )}
          <Link
            draggable={false}
            className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-sidebar-ring flex min-h-9 min-w-0 items-center gap-2 rounded-lg px-3 pr-9 outline-none focus-visible:ring-2"
            href={workspaceHref({ view: "tags", selectedId: tag.id })}
            onClick={close}
            title={tags.path(tag.id)}
            aria-label={tags.path(tag.id)}
            aria-current={
              view === "tags" && selectedId === tag.id ? "page" : undefined
            }
          >
            <TagIcon
              className="size-4 shrink-0 text-(--entity-color)"
              data-color={tag.color}
            />
            <span className="truncate">{tag.name}</span>
          </Link>
          <SidebarMenuBadge
            className="right-9 text-[11px]"
            title="Open tasks, including subtags"
          >
            {count || ""}
          </SidebarMenuBadge>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuAction
                  showOnHover
                  aria-label={`Actions for ${tag.name}`}
                  title={`Actions for ${tag.name}`}
                />
              }
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuGroup>
                {actions.map((action) => (
                  <DropdownMenuItem
                    key={action.label}
                    disabled={action.disabled}
                    onClick={action.run}
                  >
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuGroup>
          {actions.map((action) => (
            <ContextMenuItem
              key={action.label}
              disabled={action.disabled}
              onClick={action.run}
            >
              <action.Icon />
              {action.label}
            </ContextMenuItem>
          ))}
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function TagRowPreview({
  tag,
  depth,
  count,
}: {
  tag: Tag;
  depth: number;
  count: number;
}) {
  const indent = Math.min(depth, 6) * 12;
  return (
    <div
      data-tag-drop-preview
      aria-hidden="true"
      className="ring-primary/40 bg-accent/60 flex h-9 min-w-0 items-center gap-2 rounded-lg px-3 pr-9 text-[13px] opacity-50 ring-1"
      style={{ marginInlineStart: indent, width: `calc(100% - ${indent}px)` }}
    >
      <TagIcon
        className="size-4 shrink-0 text-(--entity-color)"
        data-color={tag.color}
      />
      <span className="min-w-0 flex-1 truncate">{tag.name}</span>
      <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
        {count || ""}
      </span>
    </div>
  );
}
