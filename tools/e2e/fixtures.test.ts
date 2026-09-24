import { readdirSync } from "node:fs";
import { parse, validate } from "convex-helpers/validators";
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { loadFixture, resolveTables } from "./fixtures.mjs";

const names = readdirSync(new URL("./fixtures/", import.meta.url), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

describe("end-to-end fixtures", () => {
  it.each(names)("%s matches the deployed table validators", (name) => {
    const fixture = loadFixture(name);

    const tables = resolveTables(fixture.tables, {
      userId: "auth-user",
      issuer: "http://127.0.0.1:3211",
      householdId: "household",
    });

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
    const fixture = loadFixture("reviewed-receipts");
    const t = convexTest(schema, import.meta.glob("../../convex/**/*.ts"));

    const user = t.withIdentity({
      subject: "created-user",
      issuer: "http://127.0.0.1:3211",
    });

    const receiptIds = await t.run(async (ctx) => {
      const householdId = await ctx.db.insert(
        "households",
        parse(
          schema.tables.households.validator,
          fixture.tables.households?.[0],
        ),
      );

      const tables = resolveTables(fixture.tables, {
        userId: "created-user",
        issuer: "http://127.0.0.1:3211",
        householdId,
      });

      for (const member of tables.members ?? []) {
        await ctx.db.insert(
          "members",
          parse(schema.tables.members.validator, member),
        );
      }

      const ids = [];

      for (const receipt of tables.receipts ?? []) {
        ids.push(
          await ctx.db.insert(
            "receipts",
            parse(schema.tables.receipts.validator, receipt),
          ),
        );
      }

      return ids;
    });

    expect((await user.query(api.households.current, {}))?.household.name).toBe(
      "Test household",
    );
    expect(receiptIds).toHaveLength(3);

    for (const id of receiptIds) {
      const detail = await user.query(api.receipts.detail, { id });
      expect(detail?.receipt.status).toBe("reviewed");
      expect(detail?.receipt.uploadedBy).toBe(
        "http://127.0.0.1:3211|created-user",
      );
    }
  });

  it("rejects an unresolved reference before import", () => {
    expect(() =>
      resolveTables(
        { members: [{ identity: "${MISSING_USER}" }] },
        {
          userId: "user",
          householdId: "household",
          issuer: "http://127.0.0.1:3211",
        },
      ),
    ).toThrow("Unknown fixture reference: MISSING_USER");
  });
});
