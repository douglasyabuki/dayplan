import { addDays, formatDate, timeLabel, timeToMinutes } from "./dates";
import type { DateValue, Schedule } from "./types";

export function taskDayLabel(date: string, today: string) {
  if (date === today) return "Today";
  if (today && date === addDays(today, 1)) return "Tomorrow";
  return formatDate(date);
}

export function deadlineLabel(value: DateValue, today: string) {
  return `Due ${taskDayLabel(value.date, today)}${value.time ? ` · ${timeLabel(value.time)}` : ""}`;
}

export function scheduleLabel(value: Schedule, today: string) {
  const day = taskDayLabel(value.date, today);
  if (!value.time) return `Scheduled ${day} · All day`;
  const end = timeToMinutes(value.time) + value.duration;
  const endTime = `${String(Math.floor(end / 60) % 24).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
  return `Scheduled ${day} · ${timeLabel(value.time)}–${timeLabel(endTime)}${end >= 1440 ? " (+1 day)" : ""}`;
}

/** Separate deadline text lets cards retain overdue emphasis without coloring the schedule. */
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
