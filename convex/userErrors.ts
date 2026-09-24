import { ConvexError, type Value } from "convex/values";
import {
  userErrorDataSchema,
  type UserErrorCode,
  type UserErrorData,
} from "../src/lib/user-errors";

/** A failure the person can act on. Its message reaches clients in production. */
export function userError(message: string, code: UserErrorCode = "REJECTED") {
  return new ConvexError<UserErrorData>({ code, message });
}

export const isUserError = (error: ConvexError<Value>) =>
  userErrorDataSchema.safeParse(error.data).success;
