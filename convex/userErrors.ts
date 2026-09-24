import { ConvexError } from "convex/values";
import type { UserErrorCode, UserErrorData } from "../src/lib/user-errors";

/** A failure the person can act on. Its message reaches clients in production. */
export function userError(message: string, code: UserErrorCode = "REJECTED") {
  return new ConvexError<UserErrorData>({ code, message });
}
