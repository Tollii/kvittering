import { z } from "zod";
import { v } from "convex/values";
import { parse } from "convex-helpers/validators";
import type { LocalReceipt } from "./upload-queue";

export class ReceiptMigrationError extends Error {}

const receiptValidator = v.object({
  schemaVersion: v.literal(1),
  id: v.string(),
  owner: v.string(),
  householdId: v.id("households"),
  createdAt: v.number(),
  images: v.array(v.string()),
  uploaded: v.array(v.boolean()),
  receiptId: v.id("receipts").optional(),
  error: v.string().optional(),
});

/** Retain reservation IDs, upload progress and relative image paths during upgrades. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This boundary parser validates external input before returning a domain value.
export function migrateReceipt(value: unknown): LocalReceipt {
  const input = z
    .looseObject({ schemaVersion: z.unknown().optional() })
    .safeParse(value);

  if (!input.success)
    throw new ReceiptMigrationError(
      "Ugyldig lokal kvittering. Bildene er beholdt.",
    );
  const version = "schemaVersion" in input.data ? input.data.schemaVersion : 0;

  if (version !== 0 && version !== 1)
    throw new ReceiptMigrationError(
      "Kvitteringen krever en nyere versjon av Kvitto. Bildene er beholdt.",
    );
  const result = parse(receiptValidator, { ...input.data, schemaVersion: 1 });

  if (
    !result.id ||
    !result.owner ||
    !Number.isFinite(result.createdAt) ||
    result.images.length < 1 ||
    result.images.length > 8 ||
    result.images.length !== result.uploaded.length ||
    result.images.some(
      (name) =>
        !name ||
        name.includes("/") ||
        name.includes("\\") ||
        name === "." ||
        name === "..",
    )
  )
    throw new ReceiptMigrationError(
      "Ugyldig lokal kvittering. Bildene er beholdt.",
    );

  return result;
}

export interface ReceiptDatabase {
  execSync(sql: string): void;
  getFirstSync<T>(sql: string): T | null;
  getAllSync<T>(sql: string): T[];
  runSync(sql: string, ...values: string[]): void;
  withTransactionSync(operation: () => void): void;
}

export function migrateReceiptDatabase(database: ReceiptDatabase) {
  const version =
    database.getFirstSync<{ user_version: number }>("PRAGMA user_version")
      ?.user_version ?? 0;

  if (version > 1)
    throw new ReceiptMigrationError(
      "Lokale kvitteringer krever en nyere app. Ingen data er slettet.",
    );

  if (version === 1) return;

  try {
    database.withTransactionSync(() => {
      const rows = database.getAllSync<{ id: string; data: string }>(
        "SELECT id, data FROM receipt_queue",
      );

      for (const row of rows) {
        const receipt = migrateReceipt(JSON.parse(row.data));

        if (receipt.id !== row.id)
          throw new ReceiptMigrationError(
            "Kvitteringens ID stemmer ikke. Ingen data er slettet.",
          );
        database.runSync(
          "UPDATE receipt_queue SET data = ? WHERE id = ?",
          JSON.stringify(receipt),
          row.id,
        );
      }

      database.execSync("PRAGMA user_version = 1");
    });
  } catch (error) {
    if (error instanceof ReceiptMigrationError) throw error;
    throw new ReceiptMigrationError(
      "Lokale kvitteringer kunne ikke oppgraderes. Bilder og kvitteringer er beholdt. Prøv igjen eller kontakt hjelp.",
    );
  }
}
