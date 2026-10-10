import { readdirSync } from "node:fs";
import { parse, validate } from "convex-helpers/validators";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { convexTest, type TestConvex } from "convex-test";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { reviewSummary } from "../../src/lib/domain/receipt-review";
import {
  loadFixture,
  receiptIds,
  resolveReceiptReferences,
  resolveTables,
  withoutReceiptReferences,
} from "./fixtures.mjs";

const issuer = "http://127.0.0.1:3211";

const names = readdirSync(new URL("./fixtures/", import.meta.url), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

/** Receipt ids as the test resolves them before any import. */
function fixtureReceiptIds(tables: ReturnType<typeof resolveTables>) {
  return receiptIds(
    (tables.receipts ?? []).map((row) => ({
      _id: `receipt-${String(row.clientId)}`,
      clientId: String(row.clientId),
    })),
  );
}

/**
 * Insert the fixture the way the seed script imports it: the household first,
 * then the receipts without their references, then everything that refers to
 * a receipt by its assigned id.
 */
async function seed(t: TestConvex<typeof schema>, name: string) {
  const fixture = loadFixture(name);

  return t.run(async (ctx) => {
    const householdId = await ctx.db.insert(
      "households",
      parse(schema.tables.households.validator, fixture.tables.households?.[0]),
    );

    const tables = resolveTables(fixture.tables, {
      userId: "created-user",
      issuer,
      householdId,
    });

    const ids = new Map<string, Id<"receipts">>();

    for (const receipt of tables.receipts ?? []) {
      const id = await ctx.db.insert(
        "receipts",
        parse(
          schema.tables.receipts.validator,
          withoutReceiptReferences(receipt),
        ),
      );

      ids.set(z.string().parse(receipt.clientId), id);
    }

    const resolved = resolveReceiptReferences(tables, ids);

    for (const receipt of resolved.receipts ?? []) {
      const id = ids.get(z.string().parse(receipt.clientId));

      if (!id) throw new Error(`${name}: receipt was not inserted`);

      await ctx.db.replace(
        id,
        parse(schema.tables.receipts.validator, receipt),
      );
    }

    for (const [table, rows] of Object.entries(resolved)) {
      if (table === "households" || table === "receipts") continue;

      if (!(table in schema.tables))
        throw new Error(`${name}: unknown table ${table}`);

      // SAFETY: The check above confirms that the fixture names a schema table.
      const tableName = table as keyof typeof schema.tables;

      for (const row of rows)
        await ctx.db.insert(
          tableName,
          parse(schema.tables[tableName].validator, row),
        );
    }

    return { householdId, ids: Object.fromEntries(ids) };
  });
}

function fixtureUser(t: TestConvex<typeof schema>) {
  return t.withIdentity({ subject: "created-user", issuer });
}

describe("end-to-end fixtures", () => {
  it.each(names)("%s matches the deployed table validators", (name) => {
    const fixture = loadFixture(name);

    const identity = resolveTables(fixture.tables, {
      userId: "auth-user",
      issuer,
      householdId: "household",
    });

    const tables = resolveReceiptReferences(
      identity,
      fixtureReceiptIds(identity),
    );

    expect(fixture.account, `${name}: missing account`).toBeDefined();
    expect(tables.households, `${name}: expected one household`).toHaveLength(
      1,
    );

    for (const [tableName, rows] of Object.entries(tables)) {
      const definition = Object.entries(schema.tables).find(
        ([key]) => key === tableName,
      );

      if (!definition) throw new Error(`${name}: unknown table ${tableName}`);

      for (const [index, row] of rows.entries()) {
        expect(
          validate(definition[1].validator, row, {
            throw: true,
            allowUnknownFields: false,
            _pathPrefix: `${name}.${tableName}[${index}]`,
          }),
        ).toBe(true);
      }
    }
  });

  it("lets the fixture account read its household and reviewed receipts", async () => {
    const t = convexTest(schema, import.meta.glob("../../convex/**/*.ts"));
    const { ids } = await seed(t, "reviewed-receipts");
    const user = fixtureUser(t);

    expect((await user.query(api.households.current, {}))?.household.name).toBe(
      "Test household",
    );
    expect(Object.keys(ids)).toHaveLength(3);

    for (const id of Object.values(ids)) {
      const detail = await user.query(api.receipts.detail, { id });

      expect(detail?.receipt.status).toBe("reviewed");
      expect(detail?.receipt.uploadedBy).toBe(`${issuer}|created-user`);
    }
  });

  it("gives the inbox the review states that needs-review claims", async () => {
    const t = convexTest(schema, import.meta.glob("../../convex/**/*.ts"));
    const { ids } = await seed(t, "needs-review");
    const user = fixtureUser(t);

    const page = await user.query(api.receipts.readPage, {
      scope: { kind: "inbox" },
      paginationOpts: { numItems: 20, cursor: null },
    });

    const needs = new Map(
      page.page.map((receipt) => [
        receipt.clientId,
        {
          status: receipt.status,
          needs: reviewSummary(
            receipt.data,
            !!receipt.duplicateOf && !receipt.duplicateResolved,
          ),
        },
      ]),
    );

    expect(needs).toEqual(
      new Map([
        ["e2e-review-approve", { status: "needs_review", needs: [] }],
        [
          "e2e-review-total",
          { status: "needs_review", needs: ["Betalt beløp mangler"] },
        ],
        [
          "e2e-review-duplicate",
          { status: "needs_review", needs: ["Mulig duplikat"] },
        ],
        ["e2e-review-failed", { status: "failed", needs: [] }],
      ]),
    );

    const duplicate = page.page.find(
      (receipt) => receipt.clientId === "e2e-review-duplicate",
    );

    expect(duplicate?.duplicateOf).toBe(ids["e2e-reviewed-1"]);

    const corrections = await user.query(api.corrections.listPage, {
      paginationOpts: { numItems: 20, cursor: null },
    });

    expect(corrections.page.map((entry) => entry.field)).toEqual([
      "catalog",
      "category",
      "category",
    ]);
  });

  it("rejects an unresolved reference before import", () => {
    expect(() =>
      resolveTables(
        { members: [{ identity: "${MISSING_USER}" }] },
        { userId: "user", householdId: "household", issuer },
      ),
    ).toThrow("Unknown fixture reference: MISSING_USER");

    expect(() =>
      resolveReceiptReferences(
        { corrections: [{ receiptId: "${RECEIPT:missing}" }] },
        new Map(),
      ),
    ).toThrow("Unknown fixture receipt: missing");
  });
});
