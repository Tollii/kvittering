import { v, type VString } from "convex/values";

declare const dateBrand: unique symbol;

declare const monthBrand: unique symbol;

/**
 * A calendar day as written on a receipt, "YYYY-MM-DD", without a time zone.
 *
 * Dates are stored and sent as strings, so the type is a compile-time brand.
 * ISO dates order lexically, so `<` and `===` compare them correctly. Create
 * values with the `CalendarDate` operations and read parts through them.
 */
export type CalendarDate = string & { readonly [dateBrand]: true };

/** A calendar month, "YYYY-MM". Months also order lexically. */
export type CalendarMonth = string & { readonly [monthBrand]: true };

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

const monthPattern = /^(\d{4})-(\d{2})$/;

const osloDay = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Oslo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const readable = new Intl.DateTimeFormat("nb-NO", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const monthLabel = new Intl.DateTimeFormat("nb-NO", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** Noon UTC keeps day arithmetic clear of time-zone and daylight-saving edges. */
function noon(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day, 12));
}

function dateFromUtc(value: Date): CalendarDate {
  // SAFETY: toISOString always starts with a valid "YYYY-MM-DD" date.
  return value.toISOString().slice(0, 10) as CalendarDate;
}

function monthFromUtc(value: Date): CalendarMonth {
  // SAFETY: toISOString always starts with a valid "YYYY-MM" month.
  return value.toISOString().slice(0, 7) as CalendarMonth;
}

function dateParts(date: string) {
  const [, year = "", month = "", day = ""] = datePattern.exec(date) ?? [];

  return { year: Number(year), month: Number(month), day: Number(day) };
}

function monthParts(month: string) {
  const [, year = "", number = ""] = monthPattern.exec(month) ?? [];

  return { year: Number(year), month: Number(number) };
}

// The types and their operations share names, as with Date or Number.
// eslint-disable-next-line @typescript-eslint/no-redeclare -- A companion object names the operations on the CalendarDate type.
export const CalendarDate = {
  /** A real calendar date in "YYYY-MM-DD" form, or null. */
  parse(text: string): CalendarDate | null {
    const match = datePattern.exec(text);

    if (!match) return null;
    const { year, month, day } = dateParts(text);
    const value = noon(year, month - 1, day);

    return dateFromUtc(value) === text ? dateFromUtc(value) : null;
  },

  /**
   * A range bound. Installed clients end every month on day 31, which is not a
   * real date in shorter months; it clamps to the month's last day, which
   * selects the same stored dates.
   */
  parseBound(text: string): CalendarDate | null {
    const match = datePattern.exec(text);
    const month = CalendarMonth.parse(text.slice(0, 7));
    const day = dateParts(text).day;

    return match && month && day >= 1 && day <= 31
      ? CalendarMonth.day(month, day)
      : null;
  },

  /** `month` is 1–12; out-of-range days roll into the next month. */
  of: (year: number, month: number, day: number): CalendarDate =>
    dateFromUtc(noon(year, month - 1, day)),

  /** The date in Oslo at `time`, today by default. */
  today(time = Date.now()): CalendarDate {
    // SAFETY: The sv-SE format writes Oslo dates as "YYYY-MM-DD".
    return osloDay.format(time) as CalendarDate;
  },

  /** The UTC date of an instant, for timestamps such as catalog check times. */
  ofInstant: (value: Date | number | string): CalendarDate =>
    dateFromUtc(new Date(value)),

  month: (date: CalendarDate): CalendarMonth =>
    CalendarMonth.of(dateParts(date).year, dateParts(date).month),

  year: (date: CalendarDate): number => dateParts(date).year,

  /** Day of the month, 1–31. */
  day: (date: CalendarDate): number => dateParts(date).day,

  /** Monday is 0 and Sunday is 6. */
  weekday: (date: CalendarDate): number =>
    (CalendarDate.toNoon(date).getUTCDay() + 6) % 7,

  shift(date: CalendarDate, days: number): CalendarDate {
    const { year, month, day } = dateParts(date);

    return dateFromUtc(noon(year, month - 1, day + days));
  },

  /** Ascending order for sorting; an unknown date sorts before every known one. */
  compare: (
    a: CalendarDate | null | undefined,
    b: CalendarDate | null | undefined,
  ): number => (a ?? "").localeCompare(b ?? "", "en"),

  earlier: (a: CalendarDate, b: CalendarDate): CalendarDate =>
    CalendarDate.compare(a, b) <= 0 ? a : b,

  /** Noon UTC on the date, for pickers and formatting. */
  toNoon(date: CalendarDate): Date {
    const { year, month, day } = dateParts(date);

    return noon(year, month - 1, day);
  },

  /** The local calendar day a date picker selected. */
  fromLocal: (value: Date): CalendarDate =>
    dateFromUtc(noon(value.getFullYear(), value.getMonth(), value.getDate())),

  /** "17. sep. 2026", or "Dato ukjent" when the date is not known. */
  format: (date: CalendarDate | null | undefined): string =>
    date ? readable.format(CalendarDate.toNoon(date)) : "Dato ukjent",
};

// eslint-disable-next-line @typescript-eslint/no-redeclare -- A companion object names the operations on the CalendarMonth type.
export const CalendarMonth = {
  /** A real month in "YYYY-MM" form, or null. */
  parse(text: string): CalendarMonth | null {
    const match = monthPattern.exec(text);

    if (!match) return null;
    const { year, month } = monthParts(text);

    return month >= 1 && month <= 12 ? CalendarMonth.of(year, month) : null;
  },

  /** Ascending order for sorting and comparison. */
  compare: (a: CalendarMonth, b: CalendarMonth): number =>
    a.localeCompare(b, "en"),

  /** `month` is 1–12. */
  of: (year: number, month: number): CalendarMonth =>
    monthFromUtc(noon(year, month - 1, 1)),

  /** The month in Oslo at `time`, this month by default. */
  current: (time = Date.now()): CalendarMonth =>
    CalendarDate.month(CalendarDate.today(time)),

  year: (month: CalendarMonth): number => monthParts(month).year,

  shift(month: CalendarMonth, offset: number): CalendarMonth {
    const { year, month: number } = monthParts(month);

    return monthFromUtc(noon(year, number - 1 + offset, 1));
  },

  before: (month: CalendarMonth): CalendarMonth =>
    CalendarMonth.shift(month, -1),

  days(month: CalendarMonth): number {
    const { year, month: number } = monthParts(month);

    return noon(year, number, 0).getUTCDate();
  },

  /** Day `day` of the month, clamped to its last day. */
  day(month: CalendarMonth, day: number): CalendarDate {
    const { year, month: number } = monthParts(month);

    return dateFromUtc(
      noon(year, number - 1, Math.min(day, CalendarMonth.days(month))),
    );
  },

  first: (month: CalendarMonth): CalendarDate => CalendarMonth.day(month, 1),

  last: (month: CalendarMonth): CalendarDate =>
    CalendarMonth.day(month, CalendarMonth.days(month)),

  /** "september 2026". */
  format: (month: CalendarMonth): string =>
    monthLabel.format(CalendarDate.toNoon(CalendarMonth.first(month))),

  /** Every date of the month in order. */
  dates: (month: CalendarMonth): CalendarDate[] =>
    Array.from({ length: CalendarMonth.days(month) }, (_, index) =>
      CalendarMonth.day(month, index + 1),
    ),
};

// SAFETY: Convex stores a string; receipt writes check it with CalendarDate.parse.
export const calendarDateValidator = v.string() as VString<CalendarDate>;
