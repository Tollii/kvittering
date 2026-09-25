/** A selected native journey cannot pass through a skipped or failed job. */
const scope = process.env.SCOPE_RESULT;

const required = process.env.NATIVE_REQUIRED;

const native = process.env.NATIVE_RESULT;

if (scope !== "success" || !["true", "false"].includes(required ?? "")) {
  throw new Error(
    "Native verification selection did not complete successfully.",
  );
}

if (required === "true" && native !== "success") {
  throw new Error(
    `Required iOS flows did not pass (${native ?? "missing"}). Open the native job and fix the failure.`,
  );
}

if (!["success", "skipped"].includes(native ?? "")) {
  throw new Error(
    `The native job did not complete successfully (${native ?? "missing"}).`,
  );
}

console.log(
  required === "true"
    ? "Required iOS flows passed."
    : "This change does not require native flows.",
);
