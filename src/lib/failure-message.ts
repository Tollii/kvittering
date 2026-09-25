import { reportError } from "./observability";
import { parseUserError } from "./user-errors";

/**
 * The text to show for a failed action: the user message the backend or the
 * app sent, or the fallback. Convex puts its request trace in `Error.message`
 * and platform failures are in English, so neither is shown.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This boundary reads caught errors before choosing the text to show.
export function failureMessage(
  cause: unknown,
  operation: string,
  fallback: string,
): string {
  const userError = parseUserError(cause);

  if (userError) return userError.message;
  reportError(cause, operation);

  return fallback;
}
