import type {
  ChoiceResponse,
  EntryType,
  NoulResponse,
  Questions,
  SystemOneRequest,
  SystemOneResult,
} from "@typesafe-ai/sdk";
import {
  experimental_decide,
  type Experimental_DecisionModel,
  type Experimental_DecisionQuestion,
  type ProviderMetadata,
} from "ai";
import { z } from "zod";

/**
 * Product judgments ask TypeSafe-shaped questions and read TypeSafe-shaped
 * answers. This client sends them through the AI SDK's decisions, so any
 * decision model (Jev, OpenAI Decisions, Claude) can answer them.
 */

export type JudgmentRequest<Q extends Questions = Questions> = Omit<
  SystemOneRequest<Q>,
  "model"
>;

/** What product judgments need from a model client. */
export type JudgmentClient = {
  systemOne<const Q extends Questions>(
    request: JudgmentRequest<Q>,
  ): Promise<Pick<SystemOneResult<Q>, "answers">>;
};

export type JudgmentAnswer = NoulResponse | ChoiceResponse;

/** The AI SDK has no null input; an absent text is empty. */
const input = (entry: EntryType | undefined) => entry ?? "";

function decisionQuestion(
  name: string,
  question: Questions[string],
): Experimental_DecisionQuestion {
  if (question.type === "noul")
    return {
      type: "boolean",
      instructions: input(question.instructions),
      ...(question.criteria && { criteria: question.criteria }),
    };

  if (question.type === "choice")
    return {
      type: "choice",
      instructions: input(question.instructions),
      criteria: question.criteria,
    };

  throw new Error(`Score question ${name} has no product judgment yet.`);
}

const confidenceSchema = z.record(z.string(), z.number());

/**
 * Choice confidence is what production thresholds read. Jev and OpenAI report
 * their own statistic; a model without one (Claude answers through structured
 * output with no distribution) reports zero, so nothing acts on it unseen.
 */
function confidences(metadata: ProviderMetadata | undefined) {
  for (const provider of ["typesafe", "openai"]) {
    const parsed = confidenceSchema.safeParse(metadata?.[provider]?.confidence);

    if (parsed.success) return parsed.data;
  }

  return {};
}

export function judgmentClient(
  model: Experimental_DecisionModel,
  options: { timeoutMs: number },
): JudgmentClient {
  return {
    async systemOne<const Q extends Questions>(request: JudgmentRequest<Q>) {
      const result = await experimental_decide({
        model,
        state: input(request.state),
        questions: Object.fromEntries(
          Object.entries(request.questions).map(([name, question]) => [
            name,
            decisionQuestion(name, question),
          ]),
        ),
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(options.timeoutMs),
      });

      const confidence = confidences(result.providerMetadata);

      const answers = Object.fromEntries(
        Object.entries(result.answers).map(
          ([name, answer]): [string, JudgmentAnswer] => {
            if (answer.type === "boolean")
              return [name, { type: "noul", noul: answer.probability }];

            if (answer.type === "choice")
              return [
                name,
                {
                  type: "choice",
                  choice: answer.choice,
                  confidence: confidence[name] ?? 0,
                  probabilities: answer.probabilities ?? {},
                },
              ];

            throw new Error(`Decision ${name} answered with a score.`);
          },
        ),
      );

      // SAFETY: decide answers every question under its own name with the
      // question's type, and each answer above keeps that name and type.
      return { answers: answers as SystemOneResult<Q>["answers"] };
    },
  };
}
