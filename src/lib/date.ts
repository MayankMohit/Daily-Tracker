// Date helpers. We store timestamps as UTC ISO strings and represent a "day" as
// a YYYY-MM-DD key. Per plan §8, day boundaries should ultimately be computed in
// the user's timezone; for now we key days off local time, and this module is the
// single place to make that timezone-aware later.

import {
  format,
  parseISO,
  addDays,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
} from "date-fns";

export type DayKey = string; // "YYYY-MM-DD"

/** YYYY-MM-DD for a given Date (defaults to now). */
export function toDayKey(d: Date = new Date()): DayKey {
  return format(d, "yyyy-MM-dd");
}

export function todayKey(): DayKey {
  return toDayKey(new Date());
}

export function dayKeyToDate(key: DayKey): Date {
  return parseISO(key);
}

/** Human label like "Mon 7". */
export function shortDayLabel(key: DayKey): string {
  return format(dayKeyToDate(key), "EEE d");
}

export function weekdayLabel(key: DayKey): string {
  return format(dayKeyToDate(key), "EEE");
}

/** Just the day-of-month number, e.g. "7". */
export function dayNumberLabel(key: DayKey): string {
  return format(dayKeyToDate(key), "d");
}

export function monthDayLabel(key: DayKey): string {
  return format(dayKeyToDate(key), "MMM d");
}

/** The N day-keys ending at `end` (inclusive), oldest first. */
export function lastNDays(n: number, end: Date = new Date()): DayKey[] {
  const start = addDays(end, -(n - 1));
  return eachDayOfInterval({ start, end }).map(toDayKey);
}

/** Every day-key of the month containing `ref` (1st → last day), oldest first. */
export function monthDays(ref: Date = new Date()): DayKey[] {
  return eachDayOfInterval({
    start: startOfMonth(ref),
    end: endOfMonth(ref),
  }).map(toDayKey);
}

/** The 7 day-keys of the week containing `ref` (week starts Monday), oldest first. */
export function weekDays(ref: Date = new Date()): DayKey[] {
  const start = startOfWeek(ref, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => toDayKey(addDays(start, i)));
}

export function isToday(key: DayKey): boolean {
  return isSameDay(dayKeyToDate(key), new Date());
}

/** 0 = Sunday … 6 = Saturday for a day-key. */
export function dayOfWeek(key: DayKey): number {
  return dayKeyToDate(key).getDay();
}
