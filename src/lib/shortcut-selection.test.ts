import { Ore } from "./domain/ore";
import { expect, it } from "vitest";
import {
  latestStoreReceipt,
  shortcutMonth,
  shortcutStore,
} from "./shortcut-selection";
import { testId } from "./testing/receipts";

function receipt(id: string, date: string | null, store = "Kiwi Storgata") {
  return {
    _id: testId<"receipts">(id),
    _creationTime: 0,
    status: "reviewed" as const,
    store,
    purchaseDate: date,
    totalOre: Ore.of(1000),
    spendingOre: Ore.of(1000),
    excluded: false,
  };
}

it("validates calendar months and store input at the route boundary", () => {
  expect(shortcutStore("  Kiwi  ")).toBe("Kiwi");

  for (const value of [undefined, " ", "x".repeat(101), ["Kiwi", "Rema"]])
    expect(shortcutStore(value)).toBeNull();

  for (const value of [
    undefined,
    "2026-00",
    "2026-13",
    "2026-2",
    "2026-09-01",
    ["2026-09"],
    "0000-01",
  ])
    expect(shortcutMonth(value)).toBeNull();
  expect(shortcutMonth("2026-08")).toBe("2026-08");
  expect(shortcutMonth("2024-02")).toBe("2024-02");
});

it("finds the latest purchase from the requested store, not the latest upload or item-name match", () => {
  const expected = receipt("latest", "2026-09-20");

  const results = [
    { ...receipt("old-uploaded-today", "2026-08-01"), _creationTime: 9999 },
    receipt("item-match", "2026-09-22", "Rema 1000"),
    { ...receipt("excluded", "2026-09-22"), excluded: true },
    { ...receipt("processing", "2026-09-22"), status: "processing" as const },
    receipt("undated", null),
    expected,
  ];

  expect(latestStoreReceipt(results, "  kIwI ")?._id).toBe(expected._id);
  expect(latestStoreReceipt(results, "Coop")).toBeNull();
  expect(latestStoreReceipt(results, " ")).toBeNull();
  expect(latestStoreReceipt([], "Kiwi")).toBeNull();
});

it("uses upload order only to distinguish purchases on the same date", () => {
  const first = receipt("first", "2026-09-20");
  const second = { ...receipt("second", "2026-09-20"), _creationTime: 10 };
  expect(latestStoreReceipt([first, second], "Kiwi")?._id).toBe(second._id);
});
