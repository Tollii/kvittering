import type {
  EntryType,
  Questions,
  SystemOneRequest,
  SystemOneResult,
} from "@typesafe-ai/sdk";
import { z } from "zod";

/**
 * OpenAI's Decisions API (`POST /v1/decisions`, public beta) behind the
 * `systemOne` shape the product judgments already use, so the same questions
 * can run against Jev and Decisions. Only evaluations use it.
 */

/** What product judgments need from a model client. */
export type JudgmentClient = {
  systemOne(request: SystemOneRequest): PromiseLike<SystemOneResult<Questions>>;
};

const answerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("predicate"),
    name: z.string(),
    probability: z.number(),
  }),
  z.object({
    type: z.literal("choice"),
    name: z.string(),
    choice: z.string(),
    confidence: z.number(),
    probabilities: z.array(
      z.object({ value: z.string(), probability: z.number() }),
    ),
  }),
  z.object({ type: z.literal("refusal"), name: z.string() }),
]);

const decisionSchema = z.object({
  answers: z.array(answerSchema),
  usage: z
    .object({ input_tokens: z.number(), output_tokens: z.number().optional() })
    .optional(),
});

export type DecisionAnswer = z.infer<typeof answerSchema>;

type DecisionInput =
  | string
  | {
      role: "user";
      content: (
        | { type: "input_text"; text: string }
        | { type: "input_image"; image_url: string }
      )[];
    }[];

type DecisionQuestion =
  | { type: "predicate"; name: string; instructions: string }
  | {
      type: "choice";
      name: string;
      instructions: string;
      choices: { value: string; description?: string }[];
    };

/** Plain text stays as written; structured instructions travel as JSON. */
function text(entry: EntryType | undefined) {
  const plain = z.string().safeParse(entry);

  return plain.success ? plain.data : JSON.stringify(entry ?? null);
}

function decisionQuestion(
  name: string,
  question: Questions[string],
): DecisionQuestion {
  if (question.type === "noul") {
    const outcomes = question.criteria
      ? `\nYes: ${text(question.criteria.true)}\nNo: ${text(question.criteria.false)}`
      : "";

    return {
      type: "predicate",
      name,
      instructions: `${text(question.instructions)}${outcomes}`,
    };
  }

  if (question.type === "choice")
    return {
      type: "choice",
      name,
      instructions: text(question.instructions),
      choices: Object.entries(question.criteria).map(([value, description]) =>
        description === null
          ? { value }
          : { value, description: text(description) },
      ),
    };

  throw new Error("Score questions are not translated to Decisions.");
}

export async function decide(
  options: { fetch: typeof fetch; apiKey: string; model: string },
  input: DecisionInput,
  questions: DecisionQuestion[],
) {
  const response = await options.fetch("https://api.openai.com/v1/decisions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: options.model, input, questions }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok)
    throw new Error(
      `Decisions returned ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );

  return decisionSchema.parse(await response.json());
}

/**
 * Answers keep the TypeSafe shapes: a predicate becomes `noul`, and choice
 * probabilities are keyed by label. A refusal leaves its answer missing,
 * which callers already treat as no decision.
 */
export function decisionsClient(options: {
  fetch: typeof fetch;
  apiKey: string;
  model: string;
}): JudgmentClient {
  return {
    async systemOne(request) {
      const decision = await decide(
        options,
        text(request.state),
        Object.entries(request.questions).map(([name, question]) =>
          decisionQuestion(name, question),
        ),
      );

      const answers: Record<
        string,
        SystemOneResult<Questions>["answers"][string]
      > = {};

      for (const answer of decision.answers)
        if (answer.type === "predicate")
          answers[answer.name] = { type: "noul", noul: answer.probability };
        else if (answer.type === "choice")
          answers[answer.name] = {
            type: "choice",
            choice: answer.choice,
            confidence: answer.confidence,
            probabilities: Object.fromEntries(
              answer.probabilities.map((option) => [
                option.value,
                option.probability,
              ]),
            ),
          };

      return {
        model: options.model,
        answers,
        usage: {
          input_tokens: decision.usage?.input_tokens ?? 0,
          output_tokens: decision.usage?.output_tokens ?? 0,
        },
      };
    },
  };
}
