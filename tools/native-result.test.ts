// @vitest-environment node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function nativeResult(scope: string, required: string, native: string) {
  return spawnSync(
    process.execPath,
    [resolve("tools/check-native-result.mts")],
    {
      encoding: "utf8",
      env: {
        NODE_ENV: "test",
        SCOPE_RESULT: scope,
        NATIVE_REQUIRED: required,
        NATIVE_RESULT: native,
      },
    },
  );
}

describe("required native result", () => {
  it("accepts completed required flows", () => {
    expect(nativeResult("success", "true", "success").status).toBe(0);
  });
  it.each(["skipped", "cancelled", "failure", "in_progress", ""])(
    "rejects a required job with result %j",
    (result) => {
      const check = nativeResult("success", "true", result);
      expect(check.status).not.toBe(0);
      expect(check.stderr).toContain("Required iOS flows did not pass");
    },
  );
  it("allows intentional selection of no native flows", () => {
    expect(nativeResult("success", "false", "skipped").status).toBe(0);
  });
  it.each(["failure", "cancelled", "skipped", ""])(
    "rejects failed selection %j even when the native job passed",
    (scope) => {
      expect(nativeResult(scope, "true", "success").status).not.toBe(0);
    },
  );
  it("rejects missing selection and an unexpected native failure", () => {
    expect(nativeResult("success", "", "skipped").status).not.toBe(0);
    expect(nativeResult("success", "false", "failure").status).not.toBe(0);
  });
});
