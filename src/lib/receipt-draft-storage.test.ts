import { sqliteDatabase } from "./testing/sqlite";
import { present, receiptFixture } from "./testing/receipts";
import { expect, it } from "vitest";
import { ReceiptDraftStorage } from "./receipt-draft-storage";
import { ReceiptDraftController } from "./receipt-draft-controller";
import { batteryFixture } from "./mock-receipts";

function fixture() {
  const { db, adapter, control } = sqliteDatabase();

  const receipt = receiptFixture({ data: batteryFixture(), revision: 4 });

  const open = (owner = "first") =>
    new ReceiptDraftStorage(adapter, owner, receipt.householdId, receipt._id);

  return { db, control, receipt, open };
}

it("restores exact edits and their baseline after restart without overwriting a newer remote receipt", () => {
  const { db, receipt, open } = fixture();

  try {
    const controller = new ReceiptDraftController(open, receipt);
    const data = { ...receipt.data!, store: "Changed store" };
    controller.dispatch({ type: "data", data });
    controller.dispatch({
      type: "remember",
      ids: [present(data.lines[0]).id],
      value: true,
    });
    controller.dispatch({
      type: "product",
      lineId: present(data.lines[0]).id,
      choice: { kind: "separate" },
    });
    controller.dispatch({
      type: "money-error",
      key: "total",
      error: "Incomplete amount",
    });
    controller.dispatch({ type: "start", operation: "saving" });

    const remote = {
      ...receipt,
      revision: 5,
      data: { ...receipt.data!, store: "Another member's store" },
    };

    const reopened = new ReceiptDraftController(open, remote).read();
    expect(reopened.kind).toBe("ready");

    if (reopened.kind !== "ready") throw new Error("Draft unavailable");
    expect(reopened.draft.values.data?.store).toBe("Changed store");
    expect(reopened.draft.baseline.revision).toBe(4);
    expect(reopened.draft.remote.revision).toBe(5);
    expect(reopened.draft.operation.kind).toBe("idle");
    expect(reopened.draft.moneyErrors).toEqual({ total: "Incomplete amount" });
    expect(
      reopened.draft.values.productChanges[present(data.lines[0]).id],
    ).toEqual({
      kind: "separate",
    });
    expect(open("second").restore(receipt).dirty).toBe(false);
    expect(open().restore(receipt).values.remember).toEqual([
      present(data.lines[0]).id,
    ]);
  } finally {
    db.close();
  }
});

it("clears recovery only after an acknowledged snapshot, explicit discard, or completed deletion", () => {
  const { db, receipt, open } = fixture();

  try {
    const controller = new ReceiptDraftController(open, receipt);
    controller.dispatch({ type: "edit", values: { excluded: true } });
    controller.dispatch({ type: "start", operation: "saving" });
    controller.dispatch({ type: "saved", revision: 5, approved: false });
    expect(open().restore(receipt).dirty).toBe(true);
    controller.dispatch({
      type: "remote",
      receipt: { ...receipt, revision: 5, excluded: true },
    });
    expect(open().restore(receipt).dirty).toBe(false);

    for (const action of ["discard", "deleted"] as const) {
      controller.dispatch({ type: "edit", values: { excluded: false } });
      controller.dispatch({ type: action });
      expect(open().restore(receipt).dirty).toBe(false);
    }
  } finally {
    db.close();
  }
});

it("keeps unknown future payloads and database versions unchanged", () => {
  const { db, receipt, open } = fixture();

  try {
    const controller = new ReceiptDraftController(open, receipt);
    controller.dispatch({ type: "edit", values: { excluded: true } });
    const row = db.prepare("SELECT data FROM receipt_drafts").get()!;

    const future = JSON.stringify({
      ...JSON.parse(String(row.data)),
      schemaVersion: 2,
    });

    db.prepare("UPDATE receipt_drafts SET data = ?").run(future);
    const reopened = new ReceiptDraftController(open, receipt);
    expect(reopened.read().kind).toBe("blocked");
    reopened.dispatch({ type: "discard" });
    expect(db.prepare("SELECT data FROM receipt_drafts").get()?.data).toBe(
      future,
    );
    db.exec("PRAGMA user_version = 2");
    expect(new ReceiptDraftController(open, receipt).read().kind).toBe(
      "blocked",
    );
    expect(db.prepare("PRAGMA user_version").get()?.user_version).toBe(2);
    expect(db.prepare("SELECT data FROM receipt_drafts").get()?.data).toBe(
      future,
    );
  } finally {
    db.close();
  }
});

it("retains live edits and reports failed durable writes until storage recovers", () => {
  const { db, receipt, open, control } = fixture();

  try {
    const controller = new ReceiptDraftController(open, receipt);
    control.writeFailure = true;
    controller.dispatch({ type: "edit", values: { excluded: true } });
    expect(controller.read()).toMatchObject({
      kind: "ready",
      draft: { dirty: true, values: { excluded: true } },
    });
    const failed = controller.read();

    if (failed.kind !== "ready") throw new Error("Draft is unavailable");
    expect(failed.storageError).toContain("kunne ikke lagres");
    control.writeFailure = false;
    controller.dispatch({ type: "finished" });
    expect(controller.read()).toMatchObject({ storageError: "" });
    expect(open().restore(receipt).values.excluded).toBe(true);
  } finally {
    db.close();
  }
});

it("recovers edits from a known draft version with an unknown baseline status", () => {
  const { db, receipt, open } = fixture();

  try {
    const controller = new ReceiptDraftController(open, receipt);
    controller.dispatch({ type: "edit", values: { excluded: true } });

    db.prepare(
      "UPDATE receipt_drafts SET data = json_set(data, '$.baseline', json(?))",
    ).run(JSON.stringify({ ...receipt, status: "future-processing-state" }));

    const recovered = new ReceiptDraftController(open, {
      ...receipt,
      revision: 5,
    });

    expect(recovered.read()).toMatchObject({
      kind: "ready",
      draft: {
        baseline: { revision: 4 },
        remote: { revision: 5 },
        values: { excluded: true },
      },
    });
    recovered.dispatch({
      type: "money-error",
      key: "total",
      error: "Incomplete amount",
    });
    expect(open().restore(receipt).moneyErrors).toEqual({
      total: "Incomplete amount",
    });
    expect(open().restore(receipt).values.excluded).toBe(true);
  } finally {
    db.close();
  }
});
