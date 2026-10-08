import type { DateValue } from "./types";

/**
 * Formats a date as a zero-padded `YYYY-MM-DD` calendar key.
 * @param date Date whose calendar day to use; defaults to the current date.
 * @param timezone Optional IANA time zone used to determine the calendar day.
 * @returns A date key such as `2026-09-30`.
 * @example `dateKey(new Date("2026-09-30T12:00:00Z"), "UTC")` returns `"2026-09-30"`.
 */
export function dateKey(date = new Date(), timezone?: string): string {
  if (timezone) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    return ["year", "month", "day"]
      .map((k) => parts.find((p) => p.type === k)?.value)
      .join("-");
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Creates a local Date at noon for a `YYYY-MM-DD` date key, avoiding most midnight DST shifts.
 * @param value Date key in `YYYY-MM-DD` form.
 * @returns The corresponding local Date at 12:00.
 * @example `parseDay("2026-09-30")` returns a Date for local noon on September 30, 2026.
 */
export function parseDay(value: string) {
  return new Date(`${value}T12:00:00`);
}

/**
 * Adds calendar days to a date key.
 * @param value Starting date key in `YYYY-MM-DD` form.
 * @param amount Number of calendar days to add; may be negative.
 * @returns The resulting date key.
 * @example `addDays("2026-09-30", 1)` returns `"2026-10-01"`.
 */
export function addDays(value: string, amount: number) {
  const date = parseDay(value);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

/**
 * Returns the signed number of calendar days from the first date to the second.
 * @param a Starting date key in `YYYY-MM-DD` form.
 * @param b Ending date key in `YYYY-MM-DD` form.
 * @returns `b - a` in whole calendar days.
 * @example `daysBetween("2026-09-30", "2026-10-02")` returns `2`.
 */
export function daysBetween(a: string, b: string) {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000,
  );
}

/**
 * Copies a date value while shifting only its calendar date, preserving time and other fields.
 * @param value Date value to shift; `undefined` remains `undefined`.
 * @param days Signed number of calendar days to shift.
 * @returns A copied date value with its date changed, or `undefined`.
 * @example `shiftDate({ date: "2026-09-30", time: "09:00" }, 1)` returns `{ date: "2026-10-01", time: "09:00" }`.
 */
export function shiftDate<T extends DateValue>(
  value: T | undefined,
  days: number,
): T | undefined {
  return value ? { ...value, date: addDays(value.date, days) } : undefined;
}

/**
 * Formats a date key for display using the English (US) locale and local time zone.
 * @param value Date key in `YYYY-MM-DD` form.
 * @param options Optional `Intl.DateTimeFormatOptions`; defaults to abbreviated month and numeric day.
 * @returns A localized date string.
 * @example `formatDate("2026-09-30")` returns `"Sep 30"` in an English (US) locale.
 */
export function formatDate(
  value: string,
  options?: Intl.DateTimeFormatOptions,
) {
  return parseDay(value).toLocaleDateString(
    "en-US",
    options ?? { month: "short", day: "numeric" },
  );
}

/**
 * Finds the start of the week on or before the supplied date.
 * @param value Date key in `YYYY-MM-DD` form.
 * @param weekStartsOn Weekday to start on, where Sunday is `0` and Monday is `1`.
 * @returns Date key for the start of that week.
 * @example `startOfWeek("2026-09-30")` returns `"2026-09-28"`.
 */
export function startOfWeek(value: string, weekStartsOn: 0 | 1 = 1) {
  return addDays(value, -((parseDay(value).getDay() - weekStartsOn + 7) % 7));
}

/**
 * Converts a 24-hour `HH:mm` time to minutes after midnight.
 * @param time Time string in `HH:mm` form.
 * @returns Integer minute count from midnight.
 * @example `timeToMinutes("01:30")` returns `90`.
 */
export function timeToMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Formats a 24-hour time as a compact lowercase 12-hour label.
 * @param time Time string in `HH:mm` form.
 * @returns Time label with `am` or `pm` suffix.
 * @example `timeLabel("13:05")` returns `"1:05pm"`.
 */
export function timeLabel(time: string) {
  const n = timeToMinutes(time);
  return `${Math.floor(n / 60) % 12 || 12}${n % 60 ? ":" + String(n % 60).padStart(2, "0") : ""}${n < 720 ? "am" : "pm"}`;
}
