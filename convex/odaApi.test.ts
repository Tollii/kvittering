import { expect, test } from "vitest";
import { reconcile } from "../src/lib/domain/receipt";
import { deliveredOrders, odaOrders, orderReceipt } from "./odaApi";

// Shaped like Oda's get_orders answer: prices are decimal strings in kroner.
const [order] = odaOrders.parse({
  orders: [
    {
      orderNumber: "r2fy3e",
      deliveryDate: "2026-03-22",
      currency: "NOK",
      grossAmount: 150.0,
      products: [
        {
          product: {
            id: 64592,
            name: "Vår Laveste Pris Nakkekoteletter ca. 1 kg",
            unitPrice: "87.91",
            brand: null,
          },
          quantity: 1,
          totalGrossAmount: "87.91",
        },
        {
          product: { id: 9281, name: "Agurk Norge, 1 stk", unitPrice: "33.90" },
          quantity: 2,
          totalGrossAmount: "67.80",
        },
      ],
    },
  ],
}).orders;

test("an Oda order becomes a receipt that adds up to what Oda charged", () => {
  const receipt = orderReceipt(order!);

  expect(receipt).toMatchObject({
    store: "Oda",
    purchaseDate: "2026-03-22",
    receiptNumber: "r2fy3e",
    totalOre: 15000,
  });
  expect(
    receipt.lines.map(({ kind, amountOre, quantity, unitPriceOre }) => ({
      kind,
      amountOre,
      quantity,
      unitPriceOre,
    })),
  ).toEqual([
    { kind: "product", amountOre: 8791, quantity: 1, unitPriceOre: 8791 },
    { kind: "product", amountOre: 6780, quantity: 2, unitPriceOre: 3390 },
    // Oda does not itemize discounts, deposits or delivery.
    { kind: "adjustment", amountOre: -571, quantity: null, unitPriceOre: null },
  ]);
  expect(reconcile(receipt).reviewIssues).toEqual([]);
});

test("orders that are not delivered yet are not purchases", () => {
  const later = { ...order!, orderNumber: "later", deliveryDate: "2026-03-24" };

  expect(
    deliveredOrders([order!, later], Date.parse("2026-03-23T12:00:00Z")).map(
      (candidate) => candidate.orderNumber,
    ),
  ).toEqual(["r2fy3e"]);
});
