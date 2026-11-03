// The app shows and accepts all dates in Malaysia time, whatever the server's time zone.
export const APP_TIME_ZONE = "Asia/Kuala_Lumpur";
const APP_UTC_OFFSET = "+08:00"; // Malaysia has no daylight saving

const rm = new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" });

/** 20000 → "RM 20,000.00" */
export function formatRM(value: number): string {
  return rm.format(value).replace(/^RM\s?/, "RM ");
}

const dateTime = new Intl.DateTimeFormat("en-MY", {
  timeZone: APP_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "4 Nov 2026, 2:30 pm" in Malaysia time */
export function formatDateTime(date: Date): string {
  return dateTime.format(date);
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 days ago", "in 2 hours", "now" */
export function formatRelative(date: Date, now = new Date()): string {
  const seconds = (date.getTime() - now.getTime()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

/** Date → "2026-11-04T14:30" in Malaysia time, for <input type="datetime-local">. */
export function toDateTimeLocal(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: APP_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/**
 * "2026-11-04T14:30" (no offset, from datetime-local) → Date, read as Malaysia time.
 * Strings that already carry an offset or "Z" are parsed as-is. Invalid input → Invalid Date.
 */
export function parseDateTimeLocal(value: string): Date {
  const local = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value);
  return new Date(local ? `${value}${value.length === 16 ? ":00" : ""}${APP_UTC_OFFSET}` : value);
}

/** plural(1, "activity", "activities") → "1 activity"; plural(2, "lead") → "2 leads" */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
