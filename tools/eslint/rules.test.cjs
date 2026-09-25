const { describe, it } = require("node:test");

const assert = require("node:assert/strict");

const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");

const { spawnSync } = require("node:child_process");

const { join } = require("node:path");

const { RuleTester } = require("eslint");

const parser = require("@typescript-eslint/parser");

const plugin = require("./index.cjs");

RuleTester.describe = describe;

RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parser } });

tester.run("no-undefined-record", plugin.rules["no-undefined-record"], {
  valid: [
    "type Purchase = { receiptId: string; note?: string }",
    "type Amounts = Record<string, number>",
    "type Amounts = Record<string, number | undefined>",
    "type Input = Record<string, unknown>",
    "type Fields = Record<'name' | 'note', undefined>",
    "type Fields = { [key: string]: number | undefined }",
    "type Record<K, V> = { key: K; value: V }; type Example = Record<string, undefined>",
  ],
  invalid: [
    "type Example = Record<string, undefined>",
    "type Example = Readonly<Record<string, undefined>>",
    "type Example = Record<(string), (undefined)>",
    "function save(value: Record<string, undefined>) {}",
    "type Example = { readonly [key: string]: undefined }",
  ].map((code) => ({ code, errors: [{ messageId: "explicitType" }] })),
});

tester.run("no-effect-fetch", plugin.rules["no-effect-fetch"], {
  valid: [
    "async function load() { return fetch('/receipts'); }",
    "const onPress = () => fetch('/receipts');",
    "useEffect(() => { const timer = setTimeout(tick, 100); return () => clearTimeout(timer); }, []);",
    "useMemo(() => fetch('/receipts'), []);",
    "useEffect(() => subscribe(listener), []);",
  ],
  invalid: [
    "useEffect(() => { fetch('/receipts').then(setReceipts); }, []);",
    "React.useEffect(() => { void fetch('/receipts'); }, []);",
    "useLayoutEffect(function () { fetch('/receipts'); }, []);",
    "useEffect(() => { async function load() { await fetch('/receipts'); } void load(); }, []);",
    "useEffect(() => { const request = new XMLHttpRequest(); }, []);",
  ].map((code) => ({ code, errors: [{ messageId: "subscription" }] })),
});

tester.run("no-silent-catch", plugin.rules["no-silent-catch"], {
  valid: [
    "try { send(); } catch (error) { throw new Error('Push failed', { cause: error }); }",
    "try { send(); } catch (error) { console.warn('push.delivery_failed', { error }); }",
    "try { send(); } catch (error) { return failure(error); }",
    "try { send(); } catch {\n  // Handled: the caller falls back to exact matches.\n  model = null;\n}",
    "try { send(); } catch {\n  /** Handled: the caller falls back to exact matches. */\n}",
  ],
  invalid: [
    "try { send(); } catch {}",
    "try { send(); } catch (error) { console.warn('push.delivery_failed'); }",
    "try { send(); } catch { console.warn('push.delivery_failed'); }",
    "try { send(); } catch (error) { error = null; }",
    "try { send(); } catch {\n  model = null;\n  // Handled: too late to explain.\n}",
    "try { send(); } catch {\n  // Keep going.\n  model = null;\n}",
  ].map((code) => ({ code, errors: [{ messageId: "silent" }] })),
});

tester.run("structured-log", plugin.rules["structured-log"], {
  valid: [
    "console.warn('push.delivery_failed', { attempt: 1 });",
    "console.info('receipt.processing_completed');",
    "console.warn(`push.delivery_failed`, { attempt: 1 });",
    "logger.warn('Anything goes outside console.');",
  ],
  invalid: [
    "console.warn('Receipt notification delivery failed.');",
    "console.error(`receipt.${kind}_failed`);",
    "console.info(event, fields);",
    "console.log('Push');",
    "console.warn();",
  ].map((code) => ({ code, errors: [{ messageId: "event" }] })),
});

tester.run("no-inline-literal-set", plugin.rules["no-inline-literal-set"], {
  valid: [
    "const open = new Set(['pending', 'running']); open.has(state);",
    "isReceiptProcessing(receipt.status);",
    "[first, second].includes(value);",
    "['only'].includes(value);",
  ],
  invalid: [
    "['needs_review', 'failed'].includes(receipt.status);",
    "(['summary', 'vat'] as const).includes(line.kind);",
  ].map((code) => ({ code, errors: [{ messageId: "nameSet" }] })),
});

tester.run("no-db-query-filter", plugin.rules["no-db-query-filter"], {
  valid: [
    "ctx.db.query('receipts').withIndex('by_status', (q) => q.eq('status', s)).take(10);",
    "receipts.filter((receipt) => receipt.excluded);",
    "(await ctx.db.query('receipts').take(10)).filter(Boolean);",
  ],
  invalid: [
    "ctx.db.query('receipts').withIndex('by_status', (q) => q).filter((q) => q.eq(q.field('excluded'), false)).take(1);",
    "ctx.db.system.query('_scheduled_functions').filter((q) => q).first();",
  ].map((code) => ({ code, errors: [{ messageId: "index" }] })),
});

tester.run("no-unbounded-collect", plugin.rules["no-unbounded-collect"], {
  valid: ["ctx.db.query('receipts').take(100);", "stream.collect();"],
  invalid: [
    "ctx.db.query('receipts').withIndex('by_householdId', (q) => q).collect();",
  ].map((code) => ({ code, errors: [{ messageId: "bound" }] })),
});

const access = [{ builders: ["query"], checks: ["requireMember"] }];

tester.run("convex-function-access", plugin.rules["convex-function-access"], {
  valid: [
    "export const list = query({ handler: async (ctx) => { await requireMember(ctx); } });",
    "export const nested = query({ handler: async (ctx) => { const run = () => requireMember(ctx); await run(); } });",
    "// Access: public. Clients read this before sign-in.\nexport const get = query({ handler: async () => null });",
    "export const worker = internalQuery({ handler: async () => null });",
  ].map((code) => ({ code, options: access })),
  invalid: [
    "export const list = query({ handler: async (ctx) => ctx.db.query('receipts').take(10) });",
    "// Reads receipts.\nexport const list = query({ handler: async () => null });",
  ].map((code) => ({
    code,
    options: access,
    errors: [{ messageId: "access" }],
  })),
});

const typedTester = new RuleTester({
  languageOptions: {
    parser,
    parserOptions: {
      ecmaFeatures: { jsx: true },
      project: "./tsconfig.json",
      tsconfigRootDir: join(process.cwd(), "tools", "eslint", "fixtures"),
    },
  },
});

const typed = (code) => ({
  code,
  filename: join(process.cwd(), "tools", "eslint", "fixtures", "file.tsx"),
});

typedTester.run("no-leaked-render", plugin.rules["no-leaked-render"], {
  valid: [
    "declare const busy: boolean; const view = <>{busy && <b />}</>;",
    "declare const count: number; const view = <>{count > 0 && <b />}</>;",
    "declare const name: string; const view = <>{!!name && <b />}</>;",
    "declare const label: 'Lagre' | null; const view = <>{label && <b />}</>;",
    "declare const count: 1 | 2; const view = <>{count && <b />}</>;",
    "declare const name: string; const view = <b title={name && 'x'} />;",
  ].map(typed),
  invalid: [
    "declare const count: number; const view = <>{count && <b />}</>;",
    "declare const name: string | undefined; const view = <div>{name && <b />}</div>;",
    "declare const node: React.ReactNode; const view = <>{node && <b />}</>;",
    "declare const ok: boolean; declare const count: 0 | 1; const view = <>{ok && count && <b />}</>;",
  ].map((code) => ({ ...typed(code), errors: [{ messageId: "leakedValue" }] })),
});

const oreDeclaration =
  "declare const oreBrand: unique symbol; type Ore = number & { readonly [oreBrand]: true }; declare const a: Ore; declare const b: Ore; declare let total: Ore;";

typedTester.run("no-ore-arithmetic", plugin.rules["no-ore-arithmetic"], {
  valid: [
    `${oreDeclaration} const larger = a > b;`,
    `${oreDeclaration} const same = a === b;`,
    "declare const count: number; const next = count + 1;",
  ].map(typed),
  invalid: [
    `${oreDeclaration} const sum = a + b;`,
    `${oreDeclaration} const kroner = a / 100;`,
    `${oreDeclaration} total += a;`,
    `${oreDeclaration} const negative = -a;`,
  ].map((code) => ({ ...typed(code), errors: [{ messageId: "operation" }] })),
});

const calendarDeclaration =
  "declare const dateBrand: unique symbol; type CalendarDate = string & { readonly [dateBrand]: true }; declare const day: CalendarDate;";

typedTester.run(
  "no-calendar-string-ops",
  plugin.rules["no-calendar-string-ops"],
  {
    valid: [
      `${calendarDeclaration} const same = day === day;`,
      `${calendarDeclaration} const size = day.length;`,
      "declare const text: string; const month = text.slice(0, 7);",
    ].map(typed),
    invalid: [
      `${calendarDeclaration} const month = day.slice(0, 7);`,
      `${calendarDeclaration} const first = \`\${day}-01\`;`,
      `${calendarDeclaration} const later = day.localeCompare(day);`,
    ].map((code) => ({ ...typed(code), errors: [{ messageId: "operation" }] })),
  },
);

it("runs the same rule in the repository Oxlint configuration", () => {
  const directory = mkdtempSync(join(process.cwd(), "tools", "rule-test-"));

  try {
    const file = join(directory, "invalid.ts");
    writeFileSync(
      file,
      "export type Invalid = Record<string, undefined>;\nuseEffect(() => { void fetch('/receipts'); }, []);\n",
    );

    const result = spawnSync(
      process.execPath,
      [
        "node_modules/oxlint/bin/oxlint",
        "--config",
        ".oxlintrc.json",
        "--format",
        "json",
        file,
      ],
      { encoding: "utf8" },
    );

    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);

    const codes = new Set(
      report.diagnostics.map((diagnostic) => diagnostic.code),
    );

    assert.ok(codes.has("kvitto(no-undefined-record)"));
    assert.ok(codes.has("kvitto(no-effect-fetch)"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
