import { expect, it } from "vitest";
import { createImportQueue, nextImport } from "./capture-import";

it("starts waiting files after capture becomes idle", () => {
  const queue = createImportQueue();
  queue.offer([{ uri: "receipt.pdf" }]);
  expect(nextImport(queue.snapshot(), "busy")).toBeUndefined();
  expect(nextImport(queue.snapshot(), "hidden")).toBeUndefined();
  expect(nextImport(queue.snapshot(), "idle")?.files).toEqual([
    { uri: "receipt.pdf" },
  ]);
});

it("retains failed files for an explicit retry and acknowledges only completed insertion", () => {
  const queue = createImportQueue();
  queue.offer([{ uri: "receipt.pdf" }]);
  const batch = queue.snapshot()[0];
  expect(queue.claim(batch.id)).toEqual(batch);
  expect(queue.claim(batch.id)).toBeNull();
  queue.finish(batch.id, "failed");
  expect(nextImport(queue.snapshot(), "idle")).toBeUndefined();
  expect(queue.snapshot()[0].files).toEqual(batch.files);
  queue.retry(batch.id);
  expect(queue.claim(batch.id)).not.toBeNull();
  queue.offer([{ uri: "next.jpg" }]);
  queue.finish(batch.id, "completed");
  expect(queue.snapshot()).toHaveLength(1);
  expect(queue.snapshot()[0].files[0].uri).toBe("next.jpg");
  expect(queue.claim(batch.id)).toBeNull();
});
