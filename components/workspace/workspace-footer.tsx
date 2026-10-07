import { Kbd, KbdGroup } from "@/components/ui/kbd";

export function WorkspaceFooter() {
  return (
    <footer className="text-muted-foreground flex shrink-0 flex-wrap items-center justify-between gap-2 border-t py-3 text-[10px]">
      <span>Small steps make good days.</span>
      <span>
        <Kbd>N</Kbd> new task <span className="mx-2">·</span>
        <KbdGroup>
          <Kbd className="h-4 min-w-4 px-1 text-[10px]">Ctrl</Kbd>
          <span aria-hidden="true">+</span>
          <Kbd className="h-4 min-w-4 px-1 text-[10px]">K</Kbd>
        </KbdGroup>{" "}
        /{" "}
        <KbdGroup>
          <Kbd className="h-4 min-w-4 px-1 text-[10px]">⌘</Kbd>
          <span aria-hidden="true">+</span>
          <Kbd className="h-4 min-w-4 px-1 text-[10px]">K</Kbd>
        </KbdGroup>{" "}
        search
      </span>
    </footer>
  );
}
