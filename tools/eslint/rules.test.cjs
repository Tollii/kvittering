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

it("runs the same rule in the repository Oxlint configuration", () => {
  const directory = mkdtempSync(join(process.cwd(), "tools", "rule-test-"));

  try {
    const file = join(directory, "invalid.ts");
    writeFileSync(file, "export type Invalid = Record<string, undefined>;\n");

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
    assert.ok(
      report.diagnostics.some(
        (diagnostic) => diagnostic.code === "kvitto(no-undefined-record)",
      ),
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
