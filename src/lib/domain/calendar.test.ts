import { describe, expect, it } from "vitest";
import { CalendarDate, CalendarMonth } from "./calendar";

describe("CalendarDate", () => {
  it("parses only real dates", () => {
    expect(CalendarDate.parse("2024-02-29")).toBe("2024-02-29");
    expect(CalendarDate.parse("2026-02-29")).toBeNull();
    expect(CalendarDate.parse("2026-9-1")).toBeNull();
    expect(CalendarDate.parse("")).toBeNull();
  });

  it("reads legacy month-end bounds as the month's last day", () => {
    expect(CalendarDate.parseBound("2026-09-31")).toBe("2026-09-30");
    expect(CalendarDate.parseBound("2026-02-31")).toBe("2026-02-28");
    expect(CalendarDate.parseBound("2026-09-01")).toBe("2026-09-01");
    expect(CalendarDate.parseBound("2026-13-01")).toBeNull();
    expect(CalendarDate.parseBound("2026-09-32")).toBeNull();
  });

  it("uses the Oslo date at a moment", () => {
    // 23:30 UTC on 31 December is already New Year's Day in Oslo.
    expect(CalendarDate.today(Date.UTC(2025, 11, 31, 23, 30))).toBe(
      "2026-01-01",
    );
    expect(CalendarDate.ofInstant("2026-09-17T23:30:00Z")).toBe("2026-09-17");
  });

  it("reads and moves across month and year boundaries", () => {
    const date = CalendarDate.of(2026, 3, 1);

    expect(CalendarDate.shift(date, -1)).toBe("2026-02-28");
    expect(CalendarDate.shift(CalendarDate.of(2026, 12, 31), 1)).toBe(
      "2027-01-01",
    );
    expect(CalendarDate.month(date)).toBe("2026-03");
    expect(CalendarDate.year(date)).toBe(2026);
    expect(CalendarDate.day(date)).toBe(1);
    // 1 March 2026 is a Sunday.
    expect(CalendarDate.weekday(date)).toBe(6);
    expect(CalendarDate.earlier(date, CalendarDate.of(2026, 2, 1))).toBe(
      "2026-02-01",
    );
  });

  it("keeps a picked local day", () => {
    expect(CalendarDate.fromLocal(new Date(2026, 8, 17, 0, 5))).toBe(
      "2026-09-17",
    );
  });

  it("formats known and unknown dates", () => {
    expect(CalendarDate.format(CalendarDate.of(2026, 9, 17))).toBe(
      new Intl.DateTimeFormat("nb-NO", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(Date.UTC(2026, 8, 17, 12)),
    );
    expect(CalendarDate.format(null)).toBe("Dato ukjent");
  });
});

describe("CalendarMonth", () => {
  it("parses real months", () => {
    expect(CalendarMonth.parse("2026-09")).toBe("2026-09");
    expect(CalendarMonth.parse("2026-13")).toBeNull();
    expect(CalendarMonth.parse("2026-9")).toBeNull();
  });

  it("knows its days and neighbours", () => {
    const february = CalendarMonth.of(2024, 2);

    expect(CalendarMonth.days(february)).toBe(29);
    expect(CalendarMonth.first(february)).toBe("2024-02-01");
    expect(CalendarMonth.last(february)).toBe("2024-02-29");
    expect(CalendarMonth.day(february, 31)).toBe("2024-02-29");
    expect(CalendarMonth.dates(february)).toHaveLength(29);
    expect(CalendarMonth.before(CalendarMonth.of(2026, 1))).toBe("2025-12");
    expect(CalendarMonth.shift(CalendarMonth.of(2026, 11), 3)).toBe("2027-02");
    expect(CalendarMonth.year(february)).toBe(2024);
  });
});
