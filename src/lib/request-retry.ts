import { z } from "zod";

export const deferredRequestSchema = z.object({
  data: z.object({
    code: z.literal("RATE_LIMITED"),
    message: z.string(),
    retryAt: z.number(),
  }),
});

export class RequestDeferred extends Error {
  constructor(
    message: string,
    readonly retryAt: number,
  ) {
    super(message);
  }
}

/** The service refuses requests from this release; the message says what to do. */
export class ReleaseBlocked extends Error {}

export type RetryDeadline = {
  attempts: number;
  retryAt: number;
  restricted: boolean;
};

export interface RetryStore {
  read(id: string): RetryDeadline | null;
  write(id: string, deadline: RetryDeadline): void;
  remove(id: string): void;
}

export function retryDeadline(
  attempts: number,
  now: number,
  cause: unknown,
): RetryDeadline {
  const restricted = cause instanceof RequestDeferred;

  return {
    attempts,
    restricted,
    retryAt: restricted
      ? Math.max(now + 1000, cause.retryAt)
      : now + Math.min(30 * 60_000, 30_000 * 2 ** Math.min(attempts - 1, 6)),
  };
}
