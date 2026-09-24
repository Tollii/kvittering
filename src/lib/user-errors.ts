import { z } from "zod";

/**
 * Failures a person can act on. Convex redacts plain `Error` messages in
 * production, so the backend sends these as `ConvexError` data instead.
 */
export const userErrorCodes = [
  // Another device or process saved first; read the latest version.
  "RECEIPT_CHANGED",
  // The request cannot be completed as sent; the message says why.
  "REJECTED",
] as const;

export type UserErrorCode = (typeof userErrorCodes)[number];

export type UserErrorData = { code: UserErrorCode; message: string };

export const userErrorDataSchema = z.object({
  code: z.enum(userErrorCodes),
  message: z.string().min(1).max(500),
});

/** A backend rejection that the interface shows as written. */
export class UserError extends Error {
  readonly code: UserErrorCode;

  constructor({ code, message }: UserErrorData) {
    super(message);
    this.name = "UserError";
    this.code = code;
  }
}

/** Read a user error from a Convex failure. Older or unknown payloads return null. */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This boundary parser validates caught errors before returning a domain value.
export function parseUserError(cause: unknown): UserError | null {
  if (cause instanceof UserError) return cause;

  const data = z.object({ data: userErrorDataSchema }).safeParse(cause)
    .data?.data;

  return data ? new UserError(data) : null;
}
