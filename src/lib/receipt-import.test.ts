import { present } from "./testing/receipts";
import { expect, it, vi } from "vitest";
import { importReceiptFiles, maxReceiptImages } from "./receipt-import";
import { createImportQueue } from "./capture-import";

const native = vi.hoisted(() => ({
  pages: 1,
  renderPdf: vi.fn<(uri: string, limit: number) => Promise<string[]>>(),
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace the native image boundary; import policy remains under test.
vi.mock("react-native", () => ({ Image: {} }));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace the native image boundary; import policy remains under test.
vi.mock("expo-image-manipulator", () => ({
  SaveFormat: { JPEG: "jpeg" },
  ImageManipulator: {
    manipulate: (uri: string) => ({
      resize() {},
      release() {},
      renderAsync: async () => ({
        release() {},
        saveAsync: async () => ({ uri: `${uri}.jpg` }),
      }),
    }),
  },
}));

// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace PDF rendering at the native module boundary.
vi.mock(
  "../../modules/receipt-intelligence/src/ReceiptIntelligenceModule",
  () => ({ default: { renderPdf: native.renderPdf } }),
);

it("accepts five selected images and rejects six without losing the selected inputs", async () => {
  const files = Array.from({ length: 5 }, (_, index) => ({
    uri: `image-${index}`,
    width: 100,
    height: 100,
  }));

  expect(maxReceiptImages).toBe(5);
  expect((await importReceiptFiles(files)).uris).toHaveLength(5);
  const originals = structuredClone(files);
  await expect(
    importReceiptFiles(
      [...files, { uri: "sixth", width: 100, height: 100 }],
      8,
    ),
  ).rejects.toThrow("Maks 5");
  await expect(importReceiptFiles([present(files[0])], 0)).rejects.toThrow(
    "Maks 5",
  );
  expect(files).toEqual(originals);
});

it("retains a rejected six-page PDF for explicit retry and never returns a truncated document", async () => {
  native.renderPdf.mockImplementation(async (_, limit) => {
    if (native.pages > limit) throw new Error("PDF-filen har for mange sider");

    return Array.from(
      { length: native.pages },
      (_, index) => `page-${index}.jpg`,
    );
  });
  const queue = createImportQueue();
  queue.offer([{ uri: "receipt.pdf", mimeType: "application/pdf" }]);
  const batch = present(queue.snapshot()[0]);
  queue.claim(batch.id);
  native.pages = 6;
  await expect(importReceiptFiles(batch.files)).rejects.toThrow(
    "for mange sider",
  );
  queue.finish(batch.id, "failed");
  expect(present(queue.snapshot()[0]).files).toEqual(batch.files);
  native.pages = 5;
  queue.retry(batch.id);
  const retry = queue.claim(batch.id)!;
  expect(await importReceiptFiles(retry.files)).toEqual({
    uris: Array.from({ length: 5 }, (_, index) => `page-${index}.jpg`),
    singleDocument: true,
  });
  queue.finish(batch.id, "completed");
  expect(queue.snapshot()).toEqual([]);
});
