import { v } from "convex/values";
import { env } from "./_generated/server";

/**
 * Receipt model settings. Other modules must not read the receipt reader's
 * variables from `env`, so a missing key fails in one place instead of
 * silently changing what a receipt contains.
 */

export class ProviderConfigurationError extends Error {
  override name = "ProviderConfigurationError";
}

export type ReceiptReader = { kind: "mock" } | { kind: "model"; model: string };

/**
 * `RECEIPT_MODEL` names the reader as `provider:model`. Only an explicit
 * `RECEIPT_PROVIDER=mock` reads the sample receipt.
 */
export function receiptReader(): ReceiptReader {
  const provider = env.RECEIPT_PROVIDER || "openai";

  if (provider === "mock") return { kind: "mock" };

  if (provider !== "openai")
    throw new ProviderConfigurationError(
      "Kvitteringsleseren er feilkonfigurert. Kontakt support.",
    );

  const model =
    env.RECEIPT_MODEL ?? `openai:${env.OPENAI_RECEIPT_MODEL ?? "gpt-6-luna"}`;

  // TypeSafe answers questions only; it cannot read a photo.
  if (parseModel(model).provider === "typesafe")
    throw new ProviderConfigurationError(
      "Kvitteringsleseren er feilkonfigurert. Kontakt support.",
    );

  if (!modelKey(model))
    throw new ProviderConfigurationError(
      "Kvitteringsleseren mangler API-nøkkel. Kontakt support.",
    );

  return { kind: "model", model };
}

export type ProductModel =
  | { kind: "disabled" }
  | { kind: "model"; model: string };

/** `PRODUCT_MODEL` names the product judgment model as `provider:model`, Jev by default. */
export function productModelName() {
  return env.PRODUCT_MODEL ?? `typesafe:${env.TYPESAFE_MODEL ?? "jev-latest"}`;
}

/**
 * Whether product judgments can run on this deployment. A malformed
 * `PRODUCT_MODEL` skips them rather than stopping receipts from finishing.
 */
export function hasProductModel() {
  try {
    return Boolean(modelKey(productModelName()));
  } catch (error) {
    if (!(error instanceof ProviderConfigurationError)) throw error;

    console.error("receipt.product_model_misconfigured", {
      message: error.message,
    });

    return false;
  }
}

/**
 * Receipt product judgments are optional. Without a key, or while the mock
 * reader is active, products stay unclear for the household to review.
 */
export function receiptProductModel(): ProductModel {
  const model = productModelName();

  return env.RECEIPT_PROVIDER !== "mock" && modelKey(model)
    ? { kind: "model", model }
    : { kind: "disabled" };
}

const apiKeys = {
  openai: () => env.OPENAI_API_KEY,
  anthropic: () => env.ANTHROPIC_API_KEY,
  typesafe: () => env.TYPESAFE_API_KEY,
};

export type ModelProvider = keyof typeof apiKeys;

const isProvider = (name: string): name is ModelProvider =>
  Object.hasOwn(apiKeys, name);

/** Split a `provider:model` name; the model part may itself contain colons. */
export function parseModel(name: string) {
  const separator = name.indexOf(":");
  const provider = name.slice(0, separator);
  const model = name.slice(separator + 1);

  if (separator < 1 || !model || !isProvider(provider))
    throw new ProviderConfigurationError(
      `Unknown model ${name}. Use provider:model with openai, anthropic or typesafe.`,
    );

  return { provider, model };
}

/** The API key of the model's provider, if this deployment has one. */
export function modelKey(name: string) {
  return apiKeys[parseModel(name).provider]();
}

/** How hard an evaluation asks a model to think; production uses its default. */
export const reasoningValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
);
