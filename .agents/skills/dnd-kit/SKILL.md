---
name: dnd-kit
description: Implement, debug, and review dnd-kit drag-and-drop in this React and TypeScript repository, including calendar scheduling, task lists and boards, nested tasks, sections, sidebar targets, and tag trees. Use for sensors, collision detection, previews, keyboard dragging, and drop persistence.
---

# dnd-kit

Preserve each interaction's validated UX while improving its implementation where evidence warrants it. Existing code is a behavioral baseline, not a universal architectural template.

## Start with the affected interaction

1. Identify its source, targets, provider, configuration, preview, and commit path. Read the relevant part of [the interaction map](references/interactions.md), then verify against current code.
2. Check `package.json`, `package-lock.json`, and installed `node_modules/@dnd-kit/*/package.json`. The reviewed baseline is modern **0.5.0**, not legacy dnd-kit. Check installed declarations before adopting examples from the docs marked Latest; do not upgrade packages as an incidental fix.
3. Use the official [React quickstart](https://dndkit.com/react/quickstart/) as the primary entry point. Read [API decisions](references/api-decisions.md) for configuration and targeted documentation links. Use the [TypeScript quickstart](https://dndkit.com/quickstart/) and shared concept docs for lower-level behavior, not to replace React hooks with manually managed DOM instances.
4. Separate the intended UX, the implementation mechanism, and the proposed improvement. Keep changes scoped to the requested behavior. Before changing shared configuration, identify every consumer and the regression checks for each.

## Implementation rules

- Use `DragDropProvider`, `useDraggable`, `useDroppable`, and `DragOverlay` from `@dnd-kit/react`; `useSortable` from `@dnd-kit/react/sortable`. Events expose `event.operation.source/target` and `event.canceled`. Do not mix in legacy `DndContext`, `SortableContext`, `useSensors`, `active/over`, or legacy modifier imports.
- Keep behavior-specific sensors, modifiers, collision detectors, acceptance rules, feedback, and plugins local to their interaction. Calendar defaults, task-card sensors, and tag-tree settings are intentionally different. Shared mechanics are useful only when their semantics actually match.
- Preserve workspace cross-feature drops when choosing provider boundaries. Do not split the shared task provider merely to isolate a sensor; use per-draggable settings. Keep tag-tree isolation unless changing its interaction contract explicitly.
- Keep IDs stable and unique within their registration context; distinguish rendered instance IDs from task/occurrence identity in `data`. Supply sortable indexes for the rendered group. Use typed data and narrowing rather than casts that conceal invalid targets.
- Keep the active source mounted through previews. In existing task lists, retain React-owned previews and `plugins: [SortableKeyboardPlugin]` unless deliberately replacing that state model with a verified equivalent. Do not add default optimistic sorting on top of it.
- Resolve domain-valid destinations separately from visual collision selection. Preserve recurrence, hierarchy, filtering, sorting, status, cancellation, and Undo semantics through the existing domain operations. An accepted target does not by itself authorize a domain move.
- Preserve interactive controls, focus, keyboard movement/cancel, announcements, touch scrolling, and click-versus-drag behavior. Read the local Next.js guide before changing framework code as required by `AGENTS.md`.

## Validate the outcome

Use [the scenario matrix](references/validation.md) to select observable checks, including an unaffected interaction when changing shared code. Verify preview and final state agree; cancellation and invalid drops must not commit stale destinations. Report what was tested and any gaps. A successful type check alone does not verify drag UX.
