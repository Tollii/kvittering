import type { Doc, Id, TableNames } from "../../../convex/_generated/dataModel";

/** Opaque identifiers for pure tests; these values must not be sent to Convex. */
export function testId<Table extends TableNames>(value: string): Id<Table> {
  // SAFETY: Pure tests compare identifier strings without a database lookup.
  return value as Id<Table>;
}

type ReceiptFixture = Omit<Partial<Doc<"receipts">>, "_id"> & { _id?: string };

/** Supply the complete persisted contract so tests cannot hide missing fields. */
export function receiptFixture(
  overrides: ReceiptFixture = {},
): Doc<"receipts"> {
  return {
    _creationTime: 0,
    householdId: testId<"households">("household"),
    uploadedBy: "test",
    uploaderName: "Test",
    clientId: "capture",
    imageCount: 1,
    status: "reviewed",
    revision: 0,
    generation: 0,
    data: null,
    provider: "test",
    duplicateResolved: false,
    excluded: false,
    ...overrides,
    _id: testId<"receipts">(overrides._id ?? "receipt"),
  };
}
