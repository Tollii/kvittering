import { CalendarDate, CalendarMonth } from "../domain/calendar";

/** A test date written as "YYYY-MM-DD"; fails the test when it is not a real date. */
export function date(text: string): CalendarDate {
  const value = CalendarDate.parse(text);

  if (!value) throw new Error(`Invalid test date: ${text}`);

  return value;
}

/** A test month written as "YYYY-MM". */
export function month(text: string): CalendarMonth {
  const value = CalendarMonth.parse(text);

  if (!value) throw new Error(`Invalid test month: ${text}`);

  return value;
}
