import { z } from "zod";
import { useCallback } from "react";
import { useConvex, type ConvexReactClient } from "convex/react";
import type {
  FunctionReference,
  FunctionArgs,
  FunctionReturnType,
} from "convex/server";
import { installedRelease, releaseError } from "./client";
import { getFunctionName } from "convex/server";
import { recordEvent } from "../observability";
import type { DiagnosticFields } from "../diagnostics";

export async function releaseMutation<
  M extends FunctionReference<"mutation", "public">,
>(
  convex: ConvexReactClient,
  mutation: M,
  args: FunctionArgs<M>,
): Promise<FunctionReturnType<M>> {
  const operation = getFunctionName(mutation);
  const started = Date.now();

  const fields: DiagnosticFields = { operation };

  if (operation.startsWith("receipts:")) {
    const id = z.string().safeParse(args.id).data;

    if (id !== undefined) fields.receiptId = id;
  }

  try {
    const result = await convex.mutation(mutation, {
      ...args,
      client: installedRelease,
    });

    if (
      operation !== "productAnalysis:ensure" &&
      operation !== "catalogMatching:enrich"
    )
      recordEvent("backend.mutation_completed", {
        ...fields,
        durationMs: Date.now() - started,
      });

    return result;
  } catch (error) {
    throw releaseError(error, operation, {
      ...fields,
      durationMs: Date.now() - started,
    });
  }
}

export function useReleaseMutation<
  M extends FunctionReference<"mutation", "public">,
>(mutation: M) {
  const convex = useConvex();

  return useCallback(
    (args: FunctionArgs<M>) => releaseMutation(convex, mutation, args),
    [convex, mutation],
  );
}
