import { expect, it } from "vitest";
import { visibleHousehold } from "./household";
import { testId } from "./testing/receipts";

const cached = { id: testId<"households">("cached"), name: "Hjemme" };

it("uses the cached household while the server has not answered", () => {
  expect(visibleHousehold(undefined, cached)).toBe(cached);
  expect(visibleHousehold(undefined, null)).toBeNull();
});

it("replaces the cached household with the server's answer", () => {
  const server = {
    household: { _id: testId<"households">("server"), name: "Hytta" },
  };

  expect(visibleHousehold(server, cached)).toEqual({
    id: server.household._id,
    name: "Hytta",
  });
  expect(visibleHousehold(null, cached)).toBeNull();
});
