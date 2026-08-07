// Date helpers. We store timestamps as UTC ISO strings and represent a "day" as
// a YYYY-MM-DD key. Per plan §8, day boundaries should ultimately be computed in
// the user's timezone; for now we key days off local time, and this module is the
// single place to make that timezone-aware later.

import {
  format,
  parse,
  parseISO,
  isValid,
  addDays,
  addMonths,
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

export type MonthKey = string; // "YYYY-MM"

/** "YYYY-MM" for a given Date (defaults to now). */
export function monthKey(d: Date = new Date()): MonthKey {
  return format(d, "yyyy-MM");
}

/** Parse a "YYYY-MM" key into a Date at the first of that month; null if malformed. */
export function monthKeyToDate(key: string): Date | null {
  if (!/^\d{4}-\d{2}$/.test(key)) return null;
  const d = parse(key, "yyyy-MM", new Date());
  return isValid(d) ? startOfMonth(d) : null;
}

/** Shift a "YYYY-MM" key by `n` months (negative = earlier). */
export function shiftMonth(key: MonthKey, n: number): MonthKey {
  return monthKey(addMonths(monthKeyToDate(key) ?? new Date(), n));
}

/** Human month label, e.g. "July 2026". */
export function monthLabel(key: MonthKey): string {
  return format(monthKeyToDate(key) ?? new Date(), "MMMM yyyy");
}

/** Compact month label for tight spaces, e.g. "Jul 2026". */
export function monthLabelShort(key: MonthKey): string {
  return format(monthKeyToDate(key) ?? new Date(), "MMM yyyy");
}

/** The 7 day-keys of the week containing `ref` (week starts Monday), oldest first. */
export function weekDays(ref: Date = new Date()): DayKey[] {
  const start = startOfWeek(ref, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => toDayKey(addDays(start, i)));
}

/** Monday day-key of the week containing `key` — a stable id for a week. */
export function weekStartKey(key: DayKey): DayKey {
  return toDayKey(startOfWeek(dayKeyToDate(key), { weekStartsOn: 1 }));
}

/** The 7 day-keys of the week starting at Monday `mondayKey`, oldest first. */
export function weekDaysFrom(mondayKey: DayKey): DayKey[] {
  const start = dayKeyToDate(mondayKey);
  return Array.from({ length: 7 }, (_, i) => toDayKey(addDays(start, i)));
}

/** Shift a Monday day-key by `n` weeks (negative = earlier). */
export function shiftWeek(mondayKey: DayKey, n: number): DayKey {
  return toDayKey(addDays(dayKeyToDate(mondayKey), n * 7));
}

/** Compact label for a week, e.g. "Aug 4 – 10" or "Jul 28 – Aug 3". */
export function weekLabel(mondayKey: DayKey): string {
  const start = dayKeyToDate(mondayKey);
  const end = addDays(start, 6);
  return format(start, "MMM") === format(end, "MMM")
    ? `${format(start, "MMM d")} – ${format(end, "d")}`
    : `${format(start, "MMM d")} – ${format(end, "MMM d")}`;
}

export function isToday(key: DayKey): boolean {
  return isSameDay(dayKeyToDate(key), new Date());
}

/** 0 = Sunday … 6 = Saturday for a day-key. */
export function dayOfWeek(key: DayKey): number {
  return dayKeyToDate(key).getDay();
}
