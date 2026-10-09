"use client";

import { useDraggable, useDroppable } from "@dnd-kit/react";
import {
  ChevronLeft,
  ChevronRight,
  Flag,
  GripVertical,
  Inbox,
  Plus,
  Repeat2,
} from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { DayButtonProps, DayProps } from "react-day-picker";

import { MonthCalendarContext } from "@/components/calendar/month-calendar-context";
import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { layoutDay } from "@/lib/calendar/layout";
import {
  addDays,
  dateKey,
  formatDate,
  parseDay,
  startOfWeek,
  timeLabel,
  timeToMinutes,
} from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/stores/workspace/provider";
import type { Occurrence } from "@/types-and-constants/tasks";

type Props = {
  tasks: Occurrence[];
  date: string;
  mode: string;
  setParams: (changes: Record<string, string | null>) => void;
  open: (task: Occurrence) => void;
  create: (date?: string, time?: string) => void;
};

const HOUR_HEIGHT = 128;
const DAY_COLUMN_MIN_WIDTH = 128;

export function TaskCalendarView({
  tasks,
  date,
  mode,
  setParams,
  open,
  create,
}: Props) {
  const { today, state } = useWorkspace();
  const [trayOpen, setTrayOpen] = useState(false);
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = scrollRef.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    if (viewport) viewport.scrollTop = 7 * HOUR_HEIGHT;
  }, [mode]);
  function navigate(direction: number) {
    if (mode === "month") {
      const next = parseDay(date);
      next.setDate(1);
      next.setMonth(next.getMonth() + direction);
      setParams({ date: dateKey(next) });
    } else
      setParams({ date: addDays(date, direction * (mode === "week" ? 7 : 1)) });
  }
  const first =
    mode === "month"
      ? startOfWeek(`${date.slice(0, 7)}-01`)
      : mode === "week"
        ? startOfWeek(date, 0)
        : date;
  const days = Array.from(
    { length: mode === "month" ? 42 : mode === "week" ? 7 : 1 },
    (_, i) => addDays(first, i),
  );
  const unscheduled = tasks.filter(
    (t) =>
      !t.schedule &&
      !t.completed &&
      t.title.toLowerCase().includes(query.toLowerCase()),
  );
  const renderTray = (context: string) => (
    <div className="flex flex-col gap-4 p-5 xl:px-0">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          Unscheduled{" "}
          <span className="text-muted-foreground ml-1">
            {unscheduled.length}
          </span>
        </h3>
        <Inbox className="text-muted-foreground size-4" />
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Give your tasks a little time.
        <br />
        Drag one onto your calendar.
      </p>
      <Input
        aria-label="Search unscheduled tasks"
        placeholder="Find a task…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="flex flex-col gap-2">
        {unscheduled.map((task) => (
          <CalendarCard
            key={task.id}
            task={task}
            context={context}
            onClick={() => {
              setTrayOpen(false);
              open(task);
            }}
          />
        ))}
        {!unscheduled.length && (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>All clear</EmptyTitle>
              <EmptyDescription>No unscheduled tasks match.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
      <Button
        variant="ghost"
        className="justify-start"
        onClick={() => {
          setTrayOpen(false);
          create();
        }}
      >
        <Plus data-icon="inline-start" />
        Add a task
      </Button>
      <div className="tray-note bg-muted/60 text-muted-foreground mt-8 flex items-start gap-3 rounded-lg p-4 [&_p]:text-[11px] [&_p]:leading-relaxed">
        <span className="text-lg">✳</span>
        <p>
          A plan is a starting point.
          <br />
          Leave some room for life.
        </p>
      </div>
    </div>
  );
  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              onClick={() => setParams({ date: today })}
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous period"
              onClick={() => navigate(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next period"
              onClick={() => navigate(1)}
            >
              <ChevronRight />
            </Button>
            <h2 className="ml-2 font-medium max-md:text-xs">
              {formatDate(date, {
                month: "long",
                year: "numeric",
                ...(mode === "day" ? { day: "numeric" } : {}),
              })}
            </h2>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="xl:hidden"
              onClick={() => setTrayOpen(true)}
            >
              <Inbox data-icon="inline-start" />
              Unscheduled
            </Button>
            <ToggleGroup
              value={[mode]}
              onValueChange={(values) => {
                if (values[0]) setParams({ mode: String(values[0]) });
              }}
              aria-label="Calendar view"
              variant="outline"
              spacing={0}
            >
              {["day", "week", "month"].map((m) => (
                <ToggleGroupItem value={m} key={m} className="capitalize">
                  {m}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
        <div className="text-muted-foreground mb-2 shrink-0 text-[10px] [&_span]:ml-2 max-md:[&_span]:hidden">
          {state.timezone.replaceAll("_", " ")}{" "}
          <span>· Deadlines are marked with a flag</span>
        </div>
        {mode === "month" ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <MonthCalendarContext.Provider value={{ tasks, open, create }}>
              <Calendar
                mode="single"
                month={parseDay(date)}
                selected={parseDay(date)}
                today={parseDay(today)}
                onSelect={(selected) => {
                  if (selected) setParams({ date: dateKey(selected) });
                }}
                weekStartsOn={1}
                hideNavigation
                className="w-full rounded-lg border p-0 [--cell-size:--spacing(10)] md:[--cell-size:--spacing(14)]"
                classNames={{
                  month_caption: "hidden",
                  month_grid: "w-full table-fixed border-collapse",
                  weekdays: "grid w-full grid-cols-7 border-b",
                  weekday:
                    "min-w-0 py-2 text-center text-[10px] font-normal text-muted-foreground",
                  week: "mt-0 grid w-full grid-cols-7",
                  day: "month-cell min-h-28 min-w-0 border-r border-b p-1.5 max-md:min-h-22.5 max-md:p-0.5",
                }}
                components={{
                  Day: MonthCalendarDay,
                  DayButton: MonthCalendarDayButton,
                }}
              />
            </MonthCalendarContext.Provider>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-x-auto">
              <div
                className="flex h-full min-h-0 flex-col"
                style={{
                  width: `max(100%, ${44 + days.length * DAY_COLUMN_MIN_WIDTH}px)`,
                }}
              >
                <div
                  className="time-grid-header grid shrink-0 grid-cols-[44px_repeat(var(--days),minmax(var(--day-min-width),1fr))] border-t border-r border-l max-md:grid-cols-[30px_repeat(var(--days),minmax(var(--day-min-width),1fr))]"
                  style={
                    {
                      "--days": days.length,
                      "--day-min-width": `${DAY_COLUMN_MIN_WIDTH}px`,
                    } as CSSProperties
                  }
                >
                  <div className="time-gutter" />
                  {days.map((day) => (
                    <div
                      key={day}
                      className="day-heading [&>span]:text-muted-foreground flex flex-col items-center gap-1 border-l py-3 [&>span]:text-[10px] [&>strong]:flex [&>strong]:size-7 [&>strong]:items-center [&>strong]:justify-center [&>strong]:rounded-full [&>strong]:text-base [&>strong]:font-medium"
                    >
                      <span>{formatDate(day, { weekday: "short" })}</span>
                      <strong
                        className={cn(
                          day === today &&
                            "current-day bg-primary text-primary-foreground",
                        )}
                      >
                        {parseDay(day).getDate()}
                      </strong>
                    </div>
                  ))}
                </div>
                <div
                  className="all-day-row grid max-h-[18dvh] min-h-12 shrink-0 grid-cols-[44px_repeat(var(--days),minmax(var(--day-min-width),1fr))] overflow-x-hidden overflow-y-auto border-r border-b border-l max-md:grid-cols-[30px_repeat(var(--days),minmax(var(--day-min-width),1fr))]"
                  style={
                    {
                      "--days": days.length,
                      "--day-min-width": `${DAY_COLUMN_MIN_WIDTH}px`,
                    } as CSSProperties
                  }
                >
                  <span className="all-day-label text-muted-foreground pt-2 text-center text-[9px]">
                    All day
                  </span>
                  {days.map((day) => (
                    <DropZone
                      key={day}
                      id={`all:${day}`}
                      data={{ kind: "calendar", date: day, mode: "all" }}
                      className="all-day-cell flex flex-col gap-1 border-l px-1 py-1"
                    >
                      {tasks
                        .filter(
                          (t) =>
                            (t.schedule?.date === day && !t.schedule.time) ||
                            (!t.schedule && t.deadline?.date === day),
                        )
                        .map((t) => (
                          <CalendarCard
                            key={t.id}
                            task={t}
                            context={`all:${day}`}
                            compact
                            onClick={() => open(t)}
                          />
                        ))}
                      <button
                        className="text-muted-foreground hover:bg-accent hover:text-primary flex size-5 items-center justify-center rounded opacity-40 hover:opacity-100"
                        aria-label={`Add task on ${day}`}
                        onClick={() => create(day)}
                      >
                        <Plus className="size-3" />
                      </button>
                    </DropZone>
                  ))}
                </div>
                <ScrollArea
                  className="time-grid-scroll min-h-0 flex-1 border-r border-b border-l"
                  ref={scrollRef}
                >
                  <div
                    className="time-grid relative grid grid-cols-[44px_repeat(var(--days),minmax(var(--day-min-width),1fr))] max-md:grid-cols-[30px_repeat(var(--days),minmax(var(--day-min-width),1fr))]"
                    style={
                      {
                        "--days": days.length,
                        "--day-min-width": `${DAY_COLUMN_MIN_WIDTH}px`,
                        height: HOUR_HEIGHT * 24,
                      } as CSSProperties
                    }
                  >
                    <div className="hour-labels [&>span]:text-muted-foreground relative [&>span]:absolute [&>span]:right-2 [&>span]:-translate-y-1/2 [&>span]:text-[9px]">
                      {Array.from({ length: 24 }, (_, hour) => (
                        <span key={hour} style={{ top: hour * HOUR_HEIGHT }}>
                          {hour === 0
                            ? ""
                            : timeLabel(`${String(hour).padStart(2, "0")}:00`)}
                        </span>
                      ))}
                    </div>
                    {days.map((day) => (
                      <DayColumn
                        key={day}
                        day={day}
                        tasks={tasks}
                        open={open}
                        create={create}
                      />
                    ))}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </>
        )}
      </div>
      <ScrollArea className="ml-5 hidden h-full min-h-0 w-56 shrink-0 border-l px-5 xl:block">
        {renderTray("tray-desktop")}
      </ScrollArea>
      <Sheet open={trayOpen} onOpenChange={setTrayOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Unscheduled tasks</SheetTitle>
            <SheetDescription>
              Select a task to schedule it in the editor.
            </SheetDescription>
          </SheetHeader>
          <div className="overflow-auto">{renderTray("tray-mobile")}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MonthCalendarDay({
  day,
  modifiers,
  children,
  className,
  style,
  ...props
}: DayProps) {
  const context = useContext(MonthCalendarContext);
  const [expanded, setExpanded] = useState(false);
  if (!context) throw new Error("MonthCalendarDay must be used in a calendar.");
  const dayKey = dateKey(day.date);
  const tasks = context.tasks.filter(
    (task) =>
      task.schedule?.date === dayKey ||
      (!task.schedule && task.deadline?.date === dayKey),
  );

  return (
    <td
      {...props}
      data-outside={modifiers.outside || undefined}
      className={cn(
        className,
        "month-cell min-w-0 border-r border-b p-1.5 max-md:p-0.5",
        modifiers.outside && "outside-month bg-muted/30",
      )}
      style={style}
    >
      <DropZone
        id={`month:${dayKey}`}
        data={{ kind: "calendar", date: dayKey, mode: "month" }}
        className="flex h-full min-h-28 min-w-0 flex-col gap-1 max-md:min-h-22.5"
      >
        <div className="month-cell-heading mb-1 flex items-center justify-between">
          {children}
          <button
            className="text-muted-foreground hover:bg-accent hover:text-primary flex size-5 items-center justify-center rounded opacity-40 hover:opacity-100"
            aria-label={`Add task on ${dayKey}`}
            onClick={() => context.create(dayKey)}
          >
            <Plus className="size-3" />
          </button>
        </div>
        {(expanded ? tasks : tasks.slice(0, 3)).map((task) => (
          <CalendarCard
            key={task.id}
            task={task}
            compact
            context={`month:${dayKey}`}
            onClick={() => context.open(task)}
          />
        ))}
        {tasks.length > 3 && (
          <button
            className="month-more text-muted-foreground hover:text-primary text-left text-[10px]"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Show less" : `+${tasks.length - 3} more`}
          </button>
        )}
      </DropZone>
    </td>
  );
}

function MonthCalendarDayButton(props: DayButtonProps) {
  const { today } = useWorkspace();
  const isToday = dateKey(props.day.date) === today;
  return (
    <CalendarDayButton
      {...props}
      className={cn(
        props.className,
        "month-date flex size-6 min-h-6 min-w-6 items-center justify-center rounded-full p-0 text-xs",
        isToday && "current-day bg-primary text-primary-foreground",
      )}
    />
  );
}
function DayColumn({
  day,
  tasks,
  open,
  create,
}: {
  day: string;
  tasks: Occurrence[];
  open: Props["open"];
  create: Props["create"];
}) {
  const { today, state } = useWorkspace();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: state.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return (
    <div className="day-column relative border-l">
      {Array.from({ length: 96 }, (_, i) => {
        const time = `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`;
        return (
          <DropZone
            key={time}
            id={`slot:${day}:${time}`}
            data={{ kind: "calendar", date: day, time, mode: "time" }}
            className={cn(
              "time-slot [&>button]:hover:bg-accent/30 h-8 [&>button]:block [&>button]:size-full [&>button]:cursor-default",
              i % 4 === 0 && "hour-start border-t",
            )}
          >
            <button
              tabIndex={-1}
              aria-label={`Schedule on ${day} at ${time}`}
              onDoubleClick={() => create(day, time)}
            />
          </DropZone>
        );
      })}
      {layoutDay(tasks, day).map((segment) => (
        <div
          key={segment.task.id}
          className="pointer-events-none absolute pr-1 pl-0.5 *:pointer-events-auto"
          style={{
            top: (segment.start / 60) * HOUR_HEIGHT,
            height: Math.max(
              32,
              ((segment.end - segment.start) / 60) * HOUR_HEIGHT - 2,
            ),
            left: `${(segment.lane / segment.lanes) * 100}%`,
            width: `${100 / segment.lanes}%`,
          }}
        >
          <CalendarCard
            task={segment.task}
            context={`time:${day}`}
            dayOffset={segment.dayOffset}
            onClick={() => open(segment.task)}
          />
        </div>
      ))}
      {day === today && (
        <div
          className="now-line border-destructive [&>span]:bg-destructive pointer-events-none absolute right-0 left-0 border-t [&>span]:absolute [&>span]:-top-1 [&>span]:-left-1 [&>span]:size-1.5 [&>span]:rounded-full"
          style={{ top: (timeToMinutes(parts) / 60) * HOUR_HEIGHT }}
        >
          <span />
        </div>
      )}
    </div>
  );
}

function CalendarCard({
  task,
  context,
  compact = false,
  dayOffset = 0,
  onClick,
}: {
  task: Occurrence;
  context: string;
  compact?: boolean;
  dayOffset?: number;
  onClick: () => void;
}) {
  const { state } = useWorkspace();
  const isTray = context.startsWith("tray");
  const deadlineOnly = !task.schedule && !!task.deadline && !isTray;
  const { ref, handleRef, isDragging } = useDraggable({
    id: `${context}:${task.id}`,
    disabled: deadlineOnly || task.completed,
    data: { taskId: task.id, kind: "calendar-task", dayOffset },
  });
  const project = state.projects.find((p) => p.id === task.projectId);
  return (
    <div
      ref={ref}
      className={cn(
        "calendar-card [&.tray-card]:border-border [&.tray-card]:bg-background flex h-full min-h-0 overflow-hidden rounded-md border-l-[3px] border-(--entity-color,var(--primary)) text-left [background:color-mix(in_oklch,var(--entity-color,var(--primary))_12%,var(--background))] [&.compact]:h-auto [&.compact]:min-h-6 [&.compact]:shrink-0 [&.completed]:opacity-50 [&.completed_.calendar-card-title]:line-through [&.tray-card]:min-h-16 [&.tray-card]:border",
        compact && "compact",
        isTray && "tray-card",
        deadlineOnly && "deadline-card bg-muted/60 border-l-0",
        task.completed && "completed",
        isDragging && "opacity-30",
      )}
      data-color={project?.color ?? "indigo"}
    >
      {!deadlineOnly && !task.completed && (
        <button
          ref={handleRef}
          className="text-muted-foreground flex w-3 shrink-0 touch-none items-start justify-center pt-1 opacity-40 hover:opacity-100 in-[.tray-card]:pt-3 max-md:in-[.month-cell]:hidden"
          aria-label={`Drag ${task.title}`}
        >
          <GripVertical className="size-3" />
        </button>
      )}
      <button
        className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden px-1.5 py-1 text-left in-[.tray-card]:py-3 max-md:in-[.month-cell]:px-0.5"
        onClick={onClick}
      >
        <span className="calendar-card-title flex gap-1 text-[11px] leading-snug wrap-anywhere in-[.compact]:block in-[.compact]:truncate in-[.compact]:text-[10px] max-md:text-[10px] max-md:in-[.month-cell]:text-[8px] [.compact_&>svg]:mr-1">
          {deadlineOnly && <Flag className="size-3 shrink-0" />}
          {task.title}
        </span>
        {!compact && (
          <span className="text-muted-foreground flex flex-wrap items-center gap-1 text-[9px] max-md:text-[8px]">
            {task.schedule?.time
              ? `${timeLabel(task.schedule.time)} · ${task.schedule.duration} min`
              : (project?.name ?? "Inbox")}
            {task.recurrence && <Repeat2 className="size-3" />}
          </span>
        )}
      </button>
    </div>
  );
}
export function DropZone({
  id,
  data,
  className,
  children,
}: {
  id: string;
  data: Record<string, unknown>;
  className?: string;
  children: ReactNode;
}) {
  const { ref, isDropTarget } = useDroppable({ id, data });
  return (
    <div
      ref={ref}
      className={cn(
        className,
        isDropTarget &&
          "bg-accent outline-primary! outline-2! -outline-offset-2!",
      )}
    >
      {children}
    </div>
  );
}
