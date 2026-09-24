import { expect, test } from "vitest";
import {
  compareContracts,
  contractSchema,
} from "../tools/contract/compatibility";
import {
  extractContract,
  formatContract,
  moduleNamespaces,
} from "../tools/contract/extract";
import committed from "./contract.json";

// Component configuration is not a function module and cannot load in tests.
const loaders = import.meta.glob<object>([
  "./**/*.ts",
  "!./**/*.test.ts",
  "!./_generated/**",
  "!./convex.config.ts",
]);

test("the committed contract describes the backend", async () => {
  const modules = moduleNamespaces.parse(
    Object.fromEntries(
      await Promise.all(
        Object.entries(loaders).map(
          async ([path, load]) =>
            [
              path.replace(/^\.\//, "").replace(/\.ts$/, ""),
              await load(),
            ] as const,
        ),
      ),
    ),
  );

  const current = extractContract(modules);
  const changes = compareContracts(contractSchema.parse(committed), current);

  const summary = changes
    .map(
      (change) =>
        `${change.breaking ? "BREAKING" : "compatible"} ${change.subject}: ${change.detail}`,
    )
    .join("\n");

  await expect(
    formatContract(current),
    `The backend contract changed. Run \`npm run contract:update\` and commit convex/contract.json. Breaking changes need the release review in docs/releases.md.\n${summary}`,
  ).toMatchFileSnapshot("./contract.json");
});
