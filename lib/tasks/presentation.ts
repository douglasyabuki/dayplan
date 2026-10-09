import { addDays, formatDate, timeLabel, timeToMinutes } from "@/lib/dates";
import type { DateValue } from "@/types-and-constants/dates";
import type { Schedule } from "@/types-and-constants/tasks";

/**
 * Produces a short relative label for a calendar date.
 * @param date Date key to label.
 * @param today Current date key used for relative labels.
 * @returns {string} Exactly `"Today"` when `date === today`, `"Tomorrow"` when it is one calendar day later, or the `formatDate(date)` string otherwise.
 * @example `taskDayLabel("2026-10-02", "2026-10-01")` returns `"Tomorrow"`.
 */
export function taskDayLabel(date: string, today: string) {
  if (date === today) return "Today";
  if (today && date === addDays(today, 1)) return "Tomorrow";
  return formatDate(date);
}

/**
 * Formats a deadline as due text with an optional time.
 * @param value Deadline date and optional time.
 * @param today Current date key used for relative labels.
 * @returns {string} `"Due <day>"`, with ` · <time>` appended when `value.time` exists; `<day>` is `Today`, `Tomorrow`, or the formatted date.
 * @example `deadlineLabel({ date: "2026-10-01" }, "2026-10-01")` returns `"Due Today"`.
 */
export function deadlineLabel(value: DateValue, today: string) {
  return `Due ${taskDayLabel(value.date, today)}${value.time ? ` · ${timeLabel(value.time)}` : ""}`;
}

/**
 * Formats a schedule as an all-day label or a time range.
 * @param value Schedule date, optional start time, and duration.
 * @param today Current date key used for relative labels.
 * @returns {string} `"Scheduled <day> · All day"` when `value.time` is absent; otherwise `"Scheduled <day> · <start>–<end>"`, using compact 12-hour labels and appending ` (+1 day)` when the end reaches or passes midnight.
 * @example `scheduleLabel({ date: "2026-10-01", time: "13:00", duration: 60 }, "2026-10-01")` includes `1pm–2pm`.
 */
export function scheduleLabel(value: Schedule, today: string) {
  const day = taskDayLabel(value.date, today);
  if (!value.time) return `Scheduled ${day} · All day`;
  const end = timeToMinutes(value.time) + value.duration;
  const endTime = `${String(Math.floor(end / 60) % 24).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
  return `Scheduled ${day} · ${timeLabel(value.time)}–${timeLabel(endTime)}${end >= 1440 ? " (+1 day)" : ""}`;
}

/**
 * Produces compact schedule and deadline text for a task card.
 * @param schedule Optional schedule to display.
 * @param deadline Optional deadline to display.
 * @param today Current date key used for relative labels.
 * @returns {{ scheduled: string; due: string }} `scheduled` is the schedule label without its `"Scheduled "` prefix (or `""` when no schedule exists); `due` is `"due <time-or-day>"` for same-day deadlines, `"due <day>[ <time>]"` for other deadlines, or `""` when no deadline exists.
 * @example `compactTiming(schedule, deadline, "2026-10-01")` returns concise timing strings for a card.
 */
export function compactTiming(
  schedule: Schedule | undefined,
  deadline: DateValue | undefined,
  today: string,
) {
  let scheduled = "";
  if (schedule) {
    scheduled = scheduleLabel(schedule, today).replace(/^Scheduled /, "");
    // Omit the first meridiem only when both ends of the range share it.
    scheduled = scheduled.replace(
      /(am|pm)–([^·]*?)(am|pm)/,
      (range, start, end, finish) =>
        start === finish ? `–${end}${finish}` : range,
    );
  }
  const sameDay = schedule && deadline && schedule.date === deadline.date;
  const due = deadline
    ? `due ${sameDay ? (deadline.time ? timeLabel(deadline.time) : "that day") : `${taskDayLabel(deadline.date, today)}${deadline.time ? ` ${timeLabel(deadline.time)}` : ""}`}`
    : "";
  return { scheduled, due };
}
