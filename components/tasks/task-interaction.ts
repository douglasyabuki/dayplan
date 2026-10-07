import type { SyntheticEvent } from "react";

/** Bubble-phase isolation preserves control defaults and metadata context menus. */
export const taskInteractionBoundary = {
  "data-task-interactive": "",
  onClick: (event: SyntheticEvent) => event.stopPropagation(),
  onDoubleClick: (event: SyntheticEvent) => event.stopPropagation(),
  onPointerDown: (event: SyntheticEvent) => event.stopPropagation(),
  onMouseDown: (event: SyntheticEvent) => event.stopPropagation(),
  onKeyDown: (event: SyntheticEvent) => event.stopPropagation(),
  onKeyUp: (event: SyntheticEvent) => event.stopPropagation(),
};

export function isTaskInteractive(target: EventTarget | null) {
  return (
    target instanceof Element &&
    !!target.closest(
      '[data-task-interactive],a,input,textarea,select,[contenteditable="true"],[role="dialog"],[role="menu"],button:not(.task-title),[role="checkbox"],[role="combobox"]',
    )
  );
}

export const metadataClass =
  "cursor-pointer rounded-sm text-left hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";
