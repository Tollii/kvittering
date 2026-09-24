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

const typedTester = new RuleTester({
  languageOptions: {
    parser,
    parserOptions: {
      ecmaFeatures: { jsx: true },
      project: "./tsconfig.json",
      tsconfigRootDir: join(__dirname, "fixtures"),
    },
  },
});

const typed = (code) => ({
  code,
  filename: join(__dirname, "fixtures", "file.tsx"),
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
