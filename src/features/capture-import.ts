import type { ImportedFile } from "@/lib/receipt-import";

export type ImportBatch = {
  id: number;
  files: ImportedFile[];
  state: "pending" | "claimed" | "failed";
};

export type ImportOutcome = "completed" | "failed" | "busy" | "cancelled";

/** Keep native input until capture confirms that the images entered its draft. */
export function createImportQueue() {
  let batches: ImportBatch[] = [];
  let sequence = 0;
  const listeners = new Set<() => void>();

  const publish = (next: ImportBatch[]) => {
    batches = next;
    listeners.forEach((listener) => listener());
  };

  return {
    snapshot: () => batches,
    subscribe(listener: () => void) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    offer(files: ImportedFile[]) {
      if (!files.length) return;
      sequence++;
      publish([
        ...batches,
        { id: sequence, files: [...files], state: "pending" },
      ]);
    },
    claim(id: number): ImportBatch | null {
      const batch = batches.find(
        (item) => item.id === id && item.state === "pending",
      );

      if (!batch) return null;
      publish(
        batches.map((item) =>
          item.id === id ? { ...item, state: "claimed" } : item,
        ),
      );

      return batch;
    },
    finish(id: number, outcome: ImportOutcome) {
      if (outcome === "completed")
        publish(batches.filter((item) => item.id !== id));
      else
        publish(
          batches.map((item) =>
            item.id === id
              ? { ...item, state: outcome === "busy" ? "pending" : "failed" }
              : item,
          ),
        );
    },
    retry(id: number) {
      publish(
        batches.map((item) =>
          item.id === id && item.state === "failed"
            ? { ...item, state: "pending" }
            : item,
        ),
      );
    },
    dismiss(id: number) {
      publish(
        batches.filter((item) => item.id !== id || item.state === "claimed"),
      );
    },
  };
}

export function nextImport(
  batches: readonly ImportBatch[],
  focused: boolean,
  busy: boolean,
): ImportBatch | undefined {
  return focused && !busy
    ? batches.find((batch) => batch.state === "pending")
    : undefined;
}
