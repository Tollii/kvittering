import { z } from "zod";
import { receiptImageLimitMessage } from "./domain/receipt-images";
import { RequestDeferred } from "./request-retry";
import { parseUserError } from "./user-errors";

/** Why the last upload attempt of a capture stopped. */
export const uploadFailureSchema = z.discriminatedUnion("kind", [
  /** Something went wrong on the way; the queue tries again. */
  z.object({ kind: z.literal("failed") }),
  /** The service asked the queue to wait; the message says until when. */
  z.object({ kind: z.literal("deferred"), message: z.string().min(1) }),
  /** The service refused the capture as sent; the message says why. */
  z.object({ kind: z.literal("rejected"), message: z.string().min(1) }),
  /** An older capture has more images than one receipt takes. */
  z.object({ kind: z.literal("image_limit") }),
]);

export type UploadFailure = z.infer<typeof uploadFailureSchema>;

/** Whether automatic retries stop until the person acts. */
export const waitsForPerson = (failure: UploadFailure) =>
  failure.kind === "rejected" || failure.kind === "image_limit";

export const deferral = (cause: RequestDeferred): UploadFailure => ({
  kind: "deferred",
  message: cause.message || "Opplastingen fortsetter senere.",
});

// The backend sends the image limit as the ConvexError data itself.
const imageLimitSchema = z.object({
  data: z.literal(receiptImageLimitMessage),
});

/** Read the failure a capture keeps from what an upload step threw. */
export function failureFromCause(cause: unknown): UploadFailure {
  if (cause instanceof RequestDeferred) return deferral(cause);

  if (imageLimitSchema.safeParse(cause).success) return { kind: "image_limit" };
  const rejection = parseUserError(cause);

  if (rejection?.code === "REJECTED")
    return { kind: "rejected", message: rejection.message };

  return { kind: "failed" };
}

/** The text an older release shows and matches for each failure. */
export function failureText(failure: UploadFailure) {
  switch (failure.kind) {
    case "failed":
      return "Opplastingen mislyktes.";
    case "deferred":
    case "rejected":
      return failure.message;
    case "image_limit":
      return receiptImageLimitMessage;
  }
}

/**
 * The failure of a stored capture. A row written by an older release, or by
 * one rolled back to after this one, has only the text. The text names the
 * image limit, which lets the person regroup; a capture that waits for a
 * deadline the service named (`restricted`) is that deferral; any other text
 * is a failure. A typed failure counts only beside its text, which an older
 * release clears when the upload succeeds.
 */
export function storedFailure(
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- This boundary parser validates the stored value before returning a domain value.
  typed: unknown,
  error: string | undefined,
  restricted: boolean,
): UploadFailure | undefined {
  // Older releases treat empty text as no failure.
  if (!error) return undefined;
  const parsed = uploadFailureSchema.safeParse(typed);

  // A failure kind from a later release is not an error: its text still counts.
  if (parsed.success) return parsed.data;

  if (error.includes(receiptImageLimitMessage)) return { kind: "image_limit" };

  return restricted ? { kind: "deferred", message: error } : { kind: "failed" };
}
