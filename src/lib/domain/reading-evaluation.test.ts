import { present } from "../testing/receipts";
import { expect, it } from "vitest";
import { Ore } from "./ore";
import { emptyLine } from "./receipt";
import { batteryFixture } from "../mock-receipts";
import { scoreReading, summarizeReadings } from "./reading-evaluation";

it("scores a reading against what a person approved", () => {
  const reading = batteryFixture();
  reading.totalOre = Ore.of(3331);
  present(reading.lines[0]).name = "BTRY RMX";
  present(reading.lines[0]).categoryId = "fallback.unclear";
  present(reading.lines[0]).issues = ["Varen kan ikke identifiseres."];

  const approved = batteryFixture();
  approved.lines.push({
    ...emptyLine("added"),
    name: "Melkefri sjokoladepudding",
    amountOre: Ore.of(3490),
    categoryId: "desserts.puddings",
  });

  expect(scoreReading(reading, approved)).toEqual({
    totalCorrect: false,
    balanced: false,
    products: 2,
    amountsCorrect: 1,
    namesKept: 0,
    categorized: 2,
    categoriesCorrect: 0,
    readProducts: 1,
    categoriesUnclear: 1,
    flaggedLines: 1,
  });

  const perfect = scoreReading(batteryFixture(), batteryFixture());
  expect(perfect).toMatchObject({
    totalCorrect: true,
    balanced: true,
    amountsCorrect: 1,
    namesKept: 1,
    categoriesCorrect: 1,
  });

  expect(
    summarizeReadings([perfect, scoreReading(reading, approved)]),
  ).toMatchObject({
    receipts: 2,
    totalsChecked: 2,
    totalsCorrect: 1,
    products: 3,
    categoriesCorrect: 1,
  });
});

it("pairs a fresh reading of the same receipt by printed text and amount", () => {
  const reading = batteryFixture();
  reading.lines = reading.lines.map((line) => ({
    ...line,
    id: `new-${line.id}`,
  }));

  const approved = batteryFixture();
  present(approved.lines[0]).name = "Battery Remix energidrikk";

  expect(scoreReading(reading, approved)).toMatchObject({
    products: 1,
    amountsCorrect: 1,
    namesKept: 0,
    categoriesCorrect: 1,
  });
});
