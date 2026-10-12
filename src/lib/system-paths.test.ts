import { expect, it } from "vitest";
import { systemPathRoute } from "./system-paths";

it("opens the receipts to review from links to the retired Innboks tab", () => {
  expect(systemPathRoute("kvitto:///(tabs)/inbox")).toBe(
    "/(tabs)/receipts?show=pending",
  );
  expect(systemPathRoute("kvitto:///inbox")).toBe(
    "/(tabs)/receipts?show=pending",
  );
});

it("opens Kvitteringer from links to the retired Historikk tab", () => {
  expect(systemPathRoute("kvitto:///(tabs)/history")).toBe("/(tabs)/receipts");
  expect(systemPathRoute("/history/")).toBe("/(tabs)/receipts");
});

it("keeps current links and lands shared files on the camera tab", () => {
  expect(systemPathRoute("kvitto:///(tabs)/receipts?show=pending")).toBe(
    "kvitto:///(tabs)/receipts?show=pending",
  );
  expect(systemPathRoute("kvitto:///receipt/abc")).toBe(
    "kvitto:///receipt/abc",
  );
  expect(systemPathRoute("kvitto:///inboxes")).toBe("kvitto:///inboxes");
  expect(systemPathRoute("kvitto://dataUrl=kvittoShareKey")).toBe("/");
});
