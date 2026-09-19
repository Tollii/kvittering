import { receiptFixture } from "./testing/receipts";
import { describe, expect, it } from "vitest";
import {
  createReceiptDraft,
  reduceReceiptDraft,
} from "../features/receipt-draft";

const receipt = receiptFixture({
  revision: 1,
  data: null,
  excluded: false,
  duplicateResolved: false,
});

describe("receipt draft", () => {
  it.each(["excluded", "product"] as const)(
    "clears approval when %s changes",
    (field) => {
      let state = createReceiptDraft(receipt);
      state = reduceReceiptDraft(state, { type: "start", operation: "saving" });
      state = reduceReceiptDraft(state, {
        type: "saved",
        revision: 2,
        approved: true,
      });
      state = reduceReceiptDraft(state, {
        type: "remote",
        receipt: { ...receipt, revision: 2 },
      });
      expect(state.operation.kind).toBe("saved");
      state = reduceReceiptDraft(
        state,
        field === "excluded"
          ? { type: "edit", values: { excluded: true } }
          : { type: "product", lineId: "line", choice: { kind: "separate" } },
      );
      expect(state.dirty).toBe(true);
      expect(state.operation.kind).toBe("idle");
    },
  );

  it.each([true, false])(
    "accepts query and acknowledgement in either order: %s",
    (queryFirst) => {
      let state = reduceReceiptDraft(createReceiptDraft(receipt), {
        type: "start",
        operation: "saving",
      });

      const remote = {
        type: "remote",
        receipt: { ...receipt, revision: 2 },
      } as const;

      const saved = { type: "saved", revision: 2, approved: true } as const;
      state = reduceReceiptDraft(state, queryFirst ? remote : saved);
      expect(state.baseline.revision).toBe(1);
      state = reduceReceiptDraft(state, queryFirst ? saved : remote);
      expect(state.baseline.revision).toBe(2);
      expect(state.dirty).toBe(false);
    },
  );

  it("retains later edits while accepting the acknowledged baseline", () => {
    let state = reduceReceiptDraft(createReceiptDraft(receipt), {
      type: "start",
      operation: "saving",
    });

    state = reduceReceiptDraft(state, {
      type: "edit",
      values: { excluded: true },
    });
    state = reduceReceiptDraft(state, {
      type: "saved",
      revision: 2,
      approved: true,
    });
    state = reduceReceiptDraft(state, {
      type: "remote",
      receipt: { ...receipt, revision: 2 },
    });
    expect(state.baseline.revision).toBe(2);
    expect(state.values.excluded).toBe(true);
    expect(state.dirty).toBe(true);
    expect(state.operation.kind).toBe("idle");
  });

  it("preserves a dirty draft until discard", () => {
    const initial = createReceiptDraft(receipt);

    let state = reduceReceiptDraft(initial, {
      type: "edit",
      values: { excluded: true },
    });

    state = reduceReceiptDraft(state, {
      type: "remote",
      receipt: { ...receipt, revision: 4 },
    });
    expect(state.baseline.revision).toBe(1);
    expect(initial.values.excluded).toBe(false);
    state = reduceReceiptDraft(state, { type: "discard" });
    expect(state.baseline.revision).toBe(4);
    expect(state.values.excluded).toBe(false);
  });

  it("keeps edits on failure and has explicit delete states", () => {
    let state = reduceReceiptDraft(createReceiptDraft(receipt), {
      type: "edit",
      values: { excluded: true },
    });

    state = reduceReceiptDraft(state, { type: "start", operation: "saving" });
    state = reduceReceiptDraft(state, { type: "failed", error: "Conflict" });
    expect(state.dirty).toBe(true);
    expect(state.operation).toEqual({ kind: "failed", error: "Conflict" });
    state = reduceReceiptDraft(state, { type: "start", operation: "deleting" });
    expect(state.operation.kind).toBe("deleting");
    state = reduceReceiptDraft(state, { type: "deleted" });
    expect(state.operation.kind).toBe("deleted");
    expect(state.dirty).toBe(false);
  });
});
