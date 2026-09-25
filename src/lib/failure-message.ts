import { z } from "zod";
import { reportError } from "./observability";
import { ReleaseBlocked, RequestDeferred } from "./request-retry";
import { parseUserError } from "./user-errors";

// Quota and image-limit rejections send the message itself as ConvexError data.
const messageDataSchema = z.object({ data: z.string().min(1).max(500) });

/**
 * The text to show for a failed action: the message the backend or the app
 * wrote for the person, or the fallback. Convex puts its request trace in
 * `Error.message` and platform failures are in English, so neither is shown.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This boundary reads caught errors before choosing the text to show.
export function failureMessage(
  cause: unknown,
  operation: string,
  fallback: string,
): string {
  if (cause instanceof ReleaseBlocked || cause instanceof RequestDeferred)
    return cause.message;

  const message =
    parseUserError(cause)?.message ??
    messageDataSchema.safeParse(cause).data?.data;

  if (message) return message;
  reportError(cause, operation);

  return fallback;
}
