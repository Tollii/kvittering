import { expect, it } from "vitest";
import { isReceiptProcessing } from "./receipt-status";

it("treats a receipt as processing until its images have been read", () => {
  expect(isReceiptProcessing("uploading")).toBe(true);
  expect(isReceiptProcessing("uploaded")).toBe(true);
  expect(isReceiptProcessing("processing")).toBe(true);
  expect(isReceiptProcessing("needs_review")).toBe(false);
  expect(isReceiptProcessing("reviewed")).toBe(false);
  expect(isReceiptProcessing("failed")).toBe(false);
});
