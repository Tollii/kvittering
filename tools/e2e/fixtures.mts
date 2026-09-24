import { readFileSync } from "node:fs";
import { z } from "zod";

const fixtureName = z.string().regex(/^[a-z][a-z0-9-]*$/);

const tablesSchema = z.record(
  z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
  z.array(z.record(z.string(), z.unknown())),
);

const fixtureSchema = z.strictObject({
  includes: z.array(fixtureName).default([]),
  account: z
    .strictObject({
      name: z.string().min(1),
      email: z.email(),
      password: z.string().min(12),
    })
    .optional(),
  tables: tablesSchema,
});

/** Combine named fixtures in order. Included table rows are appended. */
export function loadFixture(name: string, ancestors: string[] = []) {
  fixtureName.parse(name);

  if (ancestors.includes(name))
    throw new Error(
      `Fixture include cycle: ${[...ancestors, name].join(" -> ")}`,
    );

  const fixture = fixtureSchema.parse(
    JSON.parse(
      readFileSync(
        new URL(`./fixtures/${name}/fixture.json`, import.meta.url),
        "utf8",
      ),
    ),
  );

  const tables: z.infer<typeof tablesSchema> = {};
  let account = fixture.account;

  for (const included of fixture.includes) {
    const parent = loadFixture(included, [...ancestors, name]);

    if (account && parent.account)
      throw new Error(`Fixture ${name} defines more than one account.`);
    account ??= parent.account;
    appendTables(tables, parent.tables);
  }

  appendTables(tables, fixture.tables);

  return { account, tables };
}

function appendTables(
  target: z.infer<typeof tablesSchema>,
  source: z.infer<typeof tablesSchema>,
) {
  for (const [table, rows] of Object.entries(source)) {
    target[table] = [...(target[table] ?? []), ...rows];
  }
}

/** Replace complete placeholder values; never interpolate fixture text as code. */
export function resolveTables(
  tables: z.infer<typeof tablesSchema>,
  identity: { userId: string; householdId: string; issuer: string },
) {
  const references = new Map([
    ["USER_ID", identity.userId],
    ["USER_IDENTITY", `${identity.issuer}|${identity.userId}`],
    ["HOUSEHOLD_ID", identity.householdId],
  ]);

  const json = JSON.stringify(tables).replace(
    /"\$\{([A-Z_]+)\}"/g,
    (_match, key: string) => {
      const value = references.get(key);

      if (!value) throw new Error(`Unknown fixture reference: ${key}`);

      return JSON.stringify(value);
    },
  );

  return tablesSchema.parse(JSON.parse(json));
}
