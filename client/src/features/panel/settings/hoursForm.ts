import type { OwnerStore } from "../../../api/types";

export const HOUR_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type HourDay = (typeof HOUR_DAYS)[number];
export type StoreHours = OwnerStore["hours"];
export type HourInterval = StoreHours["weekly"]["mon"][number];
export type HourException = StoreHours["exceptions"][number];
export type HoursError = "invalidTime" | "sameTime" | "overlap" | "invalidDate" | "duplicateDate" | "emptyIntervals" | "tooManyIntervals" | "longNote" | "maxExceptions";
export type HoursErrors = Record<string, HoursError>;

export const todayForHours = (now = new Date()) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
}).format(now);

// Keep only API fields; old exceptions are discarded by the server on save.
export function hoursDraft(hours: StoreHours, today = todayForHours()): StoreHours {
  return {
    weekly: Object.fromEntries(HOUR_DAYS.map((day) => [day, hours.weekly[day].map(({ open, close }) => ({ open, close }))])) as StoreHours["weekly"],
    exceptions: hours.exceptions.filter((item) => item.date >= today).map(({ date, closed, note, intervals }) => ({
      date, closed, note, intervals: intervals.map(({ open, close }) => ({ open, close })),
    })),
  };
}

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const asMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));

export function validateHours(hours: StoreHours, today = todayForHours()): HoursErrors {
  const errors: HoursErrors = {};
  const validateIntervals = (intervals: HourInterval[], path: string) => {
    if (intervals.length > 4) errors[path] = "tooManyIntervals";
    const spans: { start: number; end: number; index: number }[] = [];
    intervals.forEach((interval, index) => {
      const key = `${path}.${index}`;
      if (!timePattern.test(interval.open)) errors[`${key}.open`] = "invalidTime";
      if (!timePattern.test(interval.close) && interval.close !== "24:00") errors[`${key}.close`] = "invalidTime";
      if (errors[`${key}.open`] || errors[`${key}.close`]) return;
      if (interval.open === interval.close) {
        errors[`${key}.close`] = "sameTime";
        return;
      }
      const start = asMinutes(interval.open);
      let end = asMinutes(interval.close);
      if (end <= start) end += 1440;
      spans.push({ start, end, index });
    });
    spans.sort((a, b) => a.start - b.start);
    for (let i = 1; i < spans.length; i++) {
      if (spans[i].start < spans[i - 1].end) {
        errors[`${path}.${spans[i].index}.open`] = "overlap";
      }
    }
  };

  for (const day of HOUR_DAYS) validateIntervals(hours.weekly[day], `weekly.${day}`);
  if (hours.exceptions.length > 60) errors.exceptions = "maxExceptions";
  const dates = new Map<string, number>();
  hours.exceptions.forEach((item, index) => {
    const path = `exceptions.${index}`;
    const parsed = new Date(`${item.date}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== item.date || item.date < today) {
      errors[`${path}.date`] = "invalidDate";
    } else if (dates.has(item.date)) {
      errors[`${path}.date`] = "duplicateDate";
      errors[`exceptions.${dates.get(item.date)}.date`] = "duplicateDate";
    } else dates.set(item.date, index);
    if (item.note.length > 60) errors[`${path}.note`] = "longNote";
    if (!item.closed) {
      if (!item.intervals.length) errors[`${path}.intervals`] = "emptyIntervals";
      validateIntervals(item.intervals, `${path}.intervals`);
    }
  });
  return errors;
}
