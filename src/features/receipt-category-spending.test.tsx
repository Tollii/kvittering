import { expect, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { emptyLine } from "@/lib/domain/receipt";
import { batteryFixture } from "@/lib/mock-receipts";
import { Ore } from "@/lib/domain/ore";
import { ReceiptCategorySpending } from "./receipt-category-spending";

test("opens the category's items and updates the selected total from the draft", async () => {
  const data = batteryFixture();
  await render(<ReceiptCategorySpending data={data} />);
  await fireEvent.press(screen.getByRole("button", { name: /Drikke,.*23,31/ }));
  expect(screen.getByText("BATTERY REMIX")).toBeTruthy();

  await screen.rerender(
    <ReceiptCategorySpending
      data={{
        ...data,
        lines: data.lines.map((line) =>
          line.id === "battery" ? { ...line, amountOre: Ore.of(3000) } : line,
        ),
      }}
    />,
  );
  expect(screen.getByTestId("receipt-category-total")).toHaveTextContent(
    Ore.format(Ore.of(2741)),
  );
  expect(screen.getByText("BATTERY REMIX")).toBeTruthy();
  expect(screen.queryByText(Ore.format(Ore.of(2331)))).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Lukk" }));
  expect(screen.queryByText("BATTERY REMIX")).toBeNull();
});

test("makes categories outside the first five available", async () => {
  const data = batteryFixture();
  data.lines = [
    "drinks.juice",
    "produce.fruit",
    "dairy.milk",
    "bakery.bread",
    "meat-fish.poultry",
    "fallback.unclear",
  ].map((categoryId, index) => ({
    ...emptyLine(`item-${index}`),
    categoryId,
    amountOre: Ore.of(600 - index * 100),
  }));
  await render(<ReceiptCategorySpending data={data} />);
  expect(screen.queryByRole("button", { name: /Uavklart,/ })).toBeNull();
  await fireEvent.press(screen.getByText("Vis alle 6"));
  expect(screen.getByRole("button", { name: /Uavklart,/ })).toBeTruthy();
  await fireEvent.press(screen.getByText("Vis færre"));
  expect(screen.queryByRole("button", { name: /Uavklart,/ })).toBeNull();
});

test("warns when receipt amounts are incomplete", async () => {
  const data = batteryFixture();
  data.lines = [{ ...emptyLine("unknown"), amountOre: null }];
  await render(<ReceiptCategorySpending data={data} />);
  expect(
    screen.getByText("Beløp mangler på noen linjer. Summene er ufullstendige."),
  ).toBeTruthy();
});

test("shows signed category amounts without misleading percentages for purchases and refunds", async () => {
  const data = batteryFixture();
  data.lines = [
    {
      ...emptyLine("purchase"),
      categoryId: "drinks.juice",
      amountOre: Ore.of(10000),
    },
    {
      ...emptyLine("refund"),
      categoryId: "produce.fruit",
      amountOre: Ore.of(-9000),
    },
  ];
  await render(<ReceiptCategorySpending data={data} />);
  expect(
    screen.getByRole("button", {
      name: `Drikke, ${Ore.format(Ore.of(10000))}`,
    }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", {
      name: `Frukt og grønt, ${Ore.format(Ore.of(-9000))}`,
    }),
  ).toBeTruthy();
  expect(screen.queryByText(/%/)).toBeNull();

  data.lines = data.lines.map((line) =>
    line.id === "refund" ? { ...line, amountOre: Ore.of(9000) } : line,
  );
  await screen.rerender(<ReceiptCategorySpending data={data} />);
  expect(
    screen.getByRole("button", { name: /Drikke,.*53 prosent/ }),
  ).toBeTruthy();
});
