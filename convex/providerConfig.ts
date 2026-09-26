import { env } from "./_generated/server";

/**
 * Receipt model settings. Other modules must not read the receipt reader's
 * variables from `env`, so a missing key fails in one place instead of
 * silently changing what a receipt contains.
 */

export class ProviderConfigurationError extends Error {
  override name = "ProviderConfigurationError";
}

export type ReceiptReader =
  { kind: "mock" } | { kind: "openai"; apiKey: string; model: string };

/** Only an explicit `RECEIPT_PROVIDER=mock` reads the sample receipt. */
export function receiptReader(): ReceiptReader {
  const provider = env.RECEIPT_PROVIDER || "openai";

  if (provider === "mock") return { kind: "mock" };

  if (provider !== "openai")
    throw new ProviderConfigurationError(
      "Kvitteringsleseren er feilkonfigurert. Kontakt support.",
    );

  if (!env.OPENAI_API_KEY)
    throw new ProviderConfigurationError(
      "Kvitteringsleseren mangler API-nøkkel. Kontakt support.",
    );

  return {
    kind: "openai",
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_RECEIPT_MODEL ?? "gpt-6-luna",
  };
}

export type ProductModel =
  { kind: "disabled" } | { kind: "typesafe"; apiKey: string; model: string };

/**
 * Receipt product judgments are optional. Without a key, or while the mock
 * reader is active, products stay unclear for the household to review.
 */
export function receiptProductModel(): ProductModel {
  if (env.RECEIPT_PROVIDER === "mock" || !env.TYPESAFE_API_KEY)
    return { kind: "disabled" };

  return {
    kind: "typesafe",
    apiKey: env.TYPESAFE_API_KEY,
    model: env.TYPESAFE_MODEL ?? "jev-latest",
  };
}
