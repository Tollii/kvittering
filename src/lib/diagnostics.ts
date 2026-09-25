import { z } from "zod";

/** Diagnostic fields contain identifiers and measurements, never receipt contents. */
export type DiagnosticFields = {
  receiptId?: string;
  captureId?: string;
  requestId?: string;
  generation?: number;
  position?: number;
  imageCount?: number;
  attempts?: number;
  durationMs?: number;
  operation?: string;
  status?: number;
  errorType?: string;
  code?: string;
  policyRevision?: number;
  outcome?: string;
  phase?: string;
  updatesEnabled?: boolean;
  development?: boolean;
  screen?: string;
  active?: boolean;
  online?: boolean;
  incomingRevision?: number;
  remoteRevision?: number;
  baselineRevision?: number;
  dirty?: boolean;
};

const errorCodeSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]{0,59}$/)
  .optional()
  .catch(undefined);

const errorMetadataSchema = z.object({
  name: z
    .string()
    .regex(/^[A-Za-z]\w{0,60}$/)
    .catch("Error"),
  status: z.number().optional().catch(undefined),
  code: errorCodeSchema,
  data: z.object({ code: errorCodeSchema }).optional().catch(undefined),
});

type ErrorDetails = {
  errorType: string;
  expected: boolean;
  status?: number;
  code?: string;
  requestId?: string;
};

/** Inspect only known error metadata. Provider messages can contain input data. */
export function errorDetails(cause: unknown): ErrorDetails {
  const metadata = errorMetadataSchema.safeParse(cause).data;
  const errorType = metadata?.name ?? "Error";
  const status = metadata?.status;
  const code = metadata?.data?.code ?? metadata?.code;
  const message = cause instanceof Error ? cause.message : "";
  const requestId = /\[Request ID: ([a-f0-9]{16,64})\]/i.exec(message)?.[1];

  const expected =
    code === "UPDATE_REQUIRED" ||
    code === "SERVICE_PAUSED" ||
    // The person sees the reason and can act on it; it is not a defect.
    code === "RECEIPT_CHANGED" ||
    code === "REJECTED" ||
    errorType === "AbortError" ||
    errorType === "TimeoutError" ||
    status === 429 ||
    // Expo wraps native cancellation in Error and retains its type in the message.
    message.startsWith("fetch failed: FetchRequestCanceledException:") ||
    /^(Network request failed|Failed to fetch|Load failed)$/.test(message);

  const details: ErrorDetails = { errorType, expected };

  if (status !== undefined) details.status = status;

  if (code) details.code = code;

  if (requestId) details.requestId = requestId;

  return details;
}
