import antiSlop from "./tools/oxlint/anti-slop/index.ts";
import { readFileSync } from "node:fs";

const base = JSON.parse(
  readFileSync(new URL("./.oxlintrc.json", import.meta.url), "utf8"),
);

// New upstream general rules are enabled automatically when the vendored copy changes.
export default {
  ...base,
  categories: { correctness: "off" },
  jsPlugins: [
    { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
  ],
  rules: Object.fromEntries(
    Object.keys(antiSlop.rules).map((name) => [`anti-slop/${name}`, "error"]),
  ),
};
