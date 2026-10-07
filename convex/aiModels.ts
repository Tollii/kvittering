import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createTypeSafeAi } from "@ai-sdk/typesafe-ai";
import type { Experimental_DecisionModel, LanguageModel } from "ai";
import type { ActionCtx } from "./_generated/server";
import {
  ProviderConfigurationError,
  modelKey,
  parseModel,
  productModelName,
} from "./providerConfig";
import { judgmentClient, type JudgmentClient } from "./decisions";
import { providerFetch } from "./providerTransport";
import type { ProviderSource } from "./rateLimits";

/**
 * Models are named `provider:model`, such as `anthropic:claude-haiku-5-5`, so
 * switching provider is a configuration change. Each provider's key comes from
 * its own variable, and every request passes through the provider quota.
 */

function settings(
  ctx: Pick<ActionCtx, "runMutation">,
  name: string,
  source?: ProviderSource,
) {
  const { provider } = parseModel(name);
  const apiKey = modelKey(name);

  if (!apiKey)
    throw new ProviderConfigurationError(
      `${provider} is missing its API key on this deployment.`,
    );

  return { apiKey, fetch: providerFetch(ctx, provider, source) };
}

export function languageModel(
  ctx: Pick<ActionCtx, "runMutation">,
  name: string,
  source?: ProviderSource,
): LanguageModel {
  const { provider, model } = parseModel(name);

  if (provider === "openai")
    return createOpenAI(settings(ctx, name, source))(model);

  if (provider === "anthropic")
    return createAnthropic(settings(ctx, name, source))(model);

  throw new ProviderConfigurationError(`${name} cannot read receipts.`);
}

export function decisionModel(
  ctx: Pick<ActionCtx, "runMutation">,
  name: string,
  source?: ProviderSource,
): Experimental_DecisionModel {
  const { provider, model } = parseModel(name);
  const options = settings(ctx, name, source);

  if (provider === "openai") return createOpenAI(options).decisionModel(model);

  if (provider === "anthropic")
    return createAnthropic(options).decisionModel(model);

  return createTypeSafeAi(options).decisionModel(model);
}

/** The product judgment client, or null when its provider has no key here. */
export function productJudgments(
  ctx: Pick<ActionCtx, "runMutation">,
  options: { source?: ProviderSource; timeoutMs: number },
): JudgmentClient | null {
  const name = productModelName();

  return modelKey(name)
    ? judgmentClient(decisionModel(ctx, name, options.source), options)
    : null;
}
