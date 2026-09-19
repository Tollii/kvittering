/** Diagnostic fields contain identifiers and measurements, never receipt contents. */
export type DiagnosticFields = {
  receiptId?: string;
  captureId?: string;
  requestId?: string;
  generation?: number;
  position?: number;
  imageCount?: number;
  durationMs?: number;
  operation?: string;
  status?: number;
  errorType?: string;
  code?: string;
  policyRevision?: number;
  outcome?: string;
};

/** Inspect only known error metadata. Provider messages can contain input data. */
export function errorDetails(error: unknown) {
  const value = error && typeof error === "object" ? error : {};
  const name = "name" in value ? value.name : undefined;
  const errorType =
    typeof name === "string" && /^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(name)
      ? name
      : "Error";
  const status =
    "status" in value && typeof value.status === "number"
      ? value.status
      : undefined;
  const data = "data" in value ? value.data : undefined;
  const code =
    data &&
    typeof data === "object" &&
    "code" in data &&
    typeof data.code === "string" &&
    /^[A-Z_]{1,60}$/.test(data.code)
      ? data.code
      : undefined;
  const message = error instanceof Error ? error.message : "";
  const expected =
    code === "UPDATE_REQUIRED" ||
    code === "SERVICE_PAUSED" ||
    errorType === "AbortError" ||
    errorType === "TimeoutError" ||
    status === 429 ||
    /^(Network request failed|Failed to fetch|Load failed)$/.test(message);
  return {
    errorType,
    ...(status !== undefined ? { status } : {}),
    ...(code ? { code } : {}),
    expected,
  };
}
