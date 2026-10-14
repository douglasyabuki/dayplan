import { cn } from "@/lib/utils";

export function DayplanLoading({
  message = "Making room for your day…",
  fullScreen = false,
  className,
}: {
  message?: string;
  fullScreen?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-slot="dayplan-loading"
      className={cn(
        "flex flex-col items-center justify-center gap-5 px-6 py-10 text-center",
        fullScreen && "bg-background min-h-dvh",
        className,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 64 64"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="text-primary size-16"
      >
        <svg width="64" height="42" viewBox="0 0 64 42" overflow="hidden">
          <g className="animate-[dayplan-sunrise_2.8s_ease-in-out_infinite_alternate] motion-reduce:animate-none">
            <circle
              cx="32"
              cy="42"
              r="12"
              fill="currentColor"
              fillOpacity="0.08"
            />
            <g className="animate-[dayplan-daylight_2.8s_ease-in-out_infinite_alternate] motion-reduce:animate-none">
              <path d="M32 17v5 M14 24l4 4 M50 24l-4 4 M7 42h5 M52 42h5" />
            </g>
          </g>
        </svg>
        <path d="M8 42h48" />
        <path d="M22 50h20" strokeOpacity="0.3" />
      </svg>
      <div className="flex flex-col items-center gap-2">
        <span
          aria-hidden="true"
          className="text-foreground text-xl font-semibold tracking-tight"
        >
          Dayplan<span className="text-primary">.</span>
        </span>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {message}
        </p>
      </div>
    </div>
  );
}
