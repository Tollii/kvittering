"use node";

import { v, type Infer } from "convex/values";
import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { decisionModel } from "./aiModels";
import {
  judgmentClient,
  type JudgmentAnswer,
  type JudgmentClient,
} from "./decisions";
import { evaluateCatalogCases } from "./catalogMatchingEvaluation";
import {
  evaluateAttributeCases,
  evaluateFamilies,
} from "./productAnalysisEvaluation";
import { linkingQuestion } from "./productMatching";
import {
  classificationQuestion,
  type ClassificationEvidence,
} from "../src/lib/domain/classification";
import {
  productEvidence,
  type ProductEvidence,
} from "../src/lib/domain/product-matching";

/*
 * Decision models, named `provider:model`, answer the same production
 * questions, so the only difference between columns is the model. Run through
 * `npm run eval -- --compare-models`. Nothing here changes receipt data.
 */

const outcomeValidator = v.object({
  actual: v.string(),
  confidence: v.union(v.number(), v.null()),
});

const caseValidator = v.object({
  suite: v.string(),
  name: v.string(),
  expected: v.string(),
  /** Production acts on an answer at or above this confidence; null when the answer has none. */
  threshold: v.union(v.number(), v.null()),
  /** A person corrected what the app showed for this line. */
  corrected: v.optional(v.boolean()),
  /** Keyed by model name. */
  outcomes: v.record(v.string(), outcomeValidator),
});

const timingValidator = v.object({
  suite: v.string(),
  requests: v.number(),
  /** Milliseconds keyed by model name. */
  ms: v.record(v.string(), v.number()),
});

const comparisonValidator = v.object({
  cases: v.array(caseValidator),
  timings: v.array(timingValidator),
});

type Case = Infer<typeof caseValidator>;

type Outcome = Infer<typeof outcomeValidator>;

type Comparison = Infer<typeof comparisonValidator>;

type Model = { name: string; client: JudgmentClient };

function models(ctx: ActionCtx, names: string[]): Model[] {
  return names.map((name) => ({
    name,
    client: judgmentClient(decisionModel(ctx, name), { timeoutMs: 60000 }),
  }));
}

/** Run one suite with each model in turn, counting its requests and time. */
async function compare<T>(
  suite: string,
  compared: Model[],
  run: (client: JudgmentClient) => Promise<T>,
) {
  const results: Record<string, T> = {};
  const ms: Record<string, number> = {};
  let requests = 0;

  for (const model of compared) {
    requests = 0;

    const counted: JudgmentClient = {
      systemOne(request) {
        requests++;

        return model.client.systemOne(request);
      },
    };

    const started = Date.now();
    results[model.name] = await run(counted);
    ms[model.name] = Date.now() - started;
  }

  return { results, timing: { suite, requests, ms } };
}

const noAnswer: Outcome = { actual: "no answer", confidence: null };

function choiceOutcome(answer: JudgmentAnswer | undefined): Outcome {
  return answer?.type === "choice"
    ? { actual: answer.choice, confidence: answer.confidence }
    : noAnswer;
}

/** One outcome per model for the case at `index`. */
function outcomes<T>(
  results: Record<string, T[]>,
  index: number,
  outcome: (result: T) => Outcome,
) {
  return Object.fromEntries(
    Object.entries(results).map(([name, items]) => {
      const item = items[index];

      return [name, item === undefined ? noAnswer : outcome(item)];
    }),
  );
}

/** Variants the friend's feedback named, labelled by the category rules both models read. */
const unusualProducts: { name: string; expected: string }[] = [
  { name: "HAVREGURT NATURELL", expected: "dairy.yoghurt" },
  { name: "TINE LF YOGHURT JORDBÆR", expected: "dairy.yoghurt" },
  { name: "OATLY HAVREDRIKK 1L", expected: "dairy.plant-milk" },
  { name: "ALPRO SOYADRIKK", expected: "dairy.plant-milk" },
  { name: "TINE LAKTOSEFRI LETTMELK", expected: "dairy.milk" },
  { name: "MLKFRI SJOKOPUDD", expected: "desserts.puddings" },
  { name: "VIOLIFE ORIGINAL SKIVER", expected: "dairy.cheese" },
  { name: "OATLY IMAT MATLAGING", expected: "dairy.cream" },
  { name: "FLORA PLANTEBASERT", expected: "dairy.butter" },
  { name: "GLUTENFRI GROVBRØD", expected: "bakery.bread" },
  { name: "ANAMMA VEGOBURGER", expected: "proteins.substitutes" },
];

const product = (
  name: string,
  brand: string | null = null,
  packageSize: number | null = null,
  packageUnit: string | null = null,
): ProductEvidence =>
  productEvidence({ name, brand, packageSize, packageUnit, attributes: [] });

/** Saved-product linking, where a wrong confident answer merges two products. */
const linkingCases = [
  {
    receipt: product("OATLY HAVREGURT NAT 400G"),
    candidates: [
      product("Oatly Havregurt Naturell", "Oatly", 400, "g"),
      product("Oatly Havregurt Blåbær", "Oatly", 400, "g"),
    ],
    expected: "candidate_0",
  },
  {
    receipt: product("TINE LETTMELK 1L"),
    candidates: [product("Tine Laktosefri Lettmelk", "Tine", 1, "l")],
    expected: "new_product",
  },
  {
    receipt: product("MLKFRI SJOKOPUDD"),
    candidates: [product("Sjokoladepudding 4x125g")],
    expected: "new_product",
  },
  {
    receipt: product("COCA-COLA ZERO 0,5L"),
    candidates: [
      product("Coca-Cola", "Coca-Cola", 0.5, "l"),
      product("Coca-Cola Zero Sugar", "Coca-Cola", 0.5, "l"),
    ],
    expected: "candidate_1",
  },
  {
    receipt: product("PEPSI MAX"),
    candidates: [
      product("Pepsi Max", "Pepsi", 1.5, "l"),
      product("Pepsi Max", "Pepsi", 0.5, "l"),
    ],
    expected: "uncertain",
  },
  {
    receipt: product("VARE"),
    candidates: [product("Tine Lettmelk", "Tine", 1, "l")],
    expected: "uncertain",
  },
  {
    receipt: product("ALPRO SOYA ORIGINAL 1L"),
    candidates: [product("Alpro Soyadrikk Original", "Alpro", 1, "l")],
    expected: "candidate_0",
  },
];

/** Categories in batches of 12, as the receipt classifier sends them. */
async function categorize(
  client: JudgmentClient,
  products: ClassificationEvidence[],
): Promise<Outcome[]> {
  const found: Outcome[] = [];

  for (let offset = 0; offset < products.length; offset += 12) {
    const batch = products.slice(offset, offset + 12);

    const response = await client.systemOne({
      state: { products: batch },
      questions: Object.fromEntries(
        batch.map((_, index) => [
          `item_${index}`,
          classificationQuestion(index),
        ]),
      ),
    });

    batch.forEach((_, index) =>
      found.push(choiceOutcome(response.answers[`item_${index}`])),
    );
  }

  return found;
}

const modelsArg = v.array(v.string());

/** Fixed cases for every product judgment made after the receipt is read. */
export const compareFixed = internalAction({
  args: { models: modelsArg },
  returns: comparisonValidator,
  handler: async (ctx, args): Promise<Comparison> => {
    const compared = models(ctx, args.models);
    const cases: Case[] = [];
    const timings: Comparison["timings"] = [];

    const families = await compare("product families", compared, (client) =>
      evaluateFamilies(client),
    );

    timings.push(families.timing);
    firstResults(families.results).forEach((item, index) =>
      cases.push({
        suite: "product families",
        name: item.name,
        expected: item.expected,
        threshold: null,
        outcomes: outcomes(families.results, index, (result) => ({
          actual: result.choice,
          confidence: result.confidence,
        })),
      }),
    );

    const attributes = await compare("product attributes", compared, (client) =>
      evaluateAttributeCases(client),
    );

    timings.push(attributes.timing);
    firstResults(attributes.results).forEach((item, index) =>
      cases.push({
        suite: "product attributes",
        name: item.name,
        expected: `${item.expectedType}/${item.expectedSugar}`,
        threshold: null,
        outcomes: outcomes(attributes.results, index, (result) => ({
          actual: `${result.attributes.type.value}/${result.attributes.sugar.value}`,
          confidence: null,
        })),
      }),
    );

    const catalog = await compare("catalog matches", compared, (client) =>
      evaluateCatalogCases(client),
    );

    timings.push(catalog.timing);
    firstResults(catalog.results).forEach((item, index) =>
      cases.push({
        suite: "catalog matches",
        name: item.name,
        expected: item.expected,
        threshold: null,
        // A provider failure leaves the line unresolved, which is not a pass.
        outcomes: outcomes(catalog.results, index, (result) => ({
          actual:
            result.reason === "provider_error"
              ? "provider error"
              : result.actual,
          confidence: null,
        })),
      }),
    );

    const linking = await compare(
      "same-product links",
      compared,
      async (client) => {
        const response = await client.systemOne({
          state: {
            items: linkingCases.map((item) => ({
              receiptDescription: item.receipt,
              candidates: item.candidates,
            })),
          },
          questions: Object.fromEntries(
            linkingCases.map((item, index) => [
              `item_${index}`,
              linkingQuestion(index, item.candidates.length),
            ]),
          ),
        });

        return linkingCases.map((_, index) =>
          choiceOutcome(response.answers[`item_${index}`]),
        );
      },
    );

    timings.push(linking.timing);
    linkingCases.forEach((item, index) =>
      cases.push({
        suite: "same-product links",
        name: item.receipt.name,
        expected: item.expected,
        threshold: 0.85,
        outcomes: outcomes(linking.results, index, (result) => result),
      }),
    );

    const unusual = await compare("unusual products", compared, (client) =>
      categorize(
        client,
        unusualProducts.map(({ name }) => ({ name })),
      ),
    );

    timings.push(unusual.timing);
    unusualProducts.forEach((item, index) =>
      cases.push({
        suite: "unusual products",
        name: item.name,
        expected: item.expected,
        threshold: 0.5,
        outcomes: outcomes(unusual.results, index, (result) => result),
      }),
    );

    return { cases, timings };
  },
});

/** The cases themselves, from whichever model ran first. */
function firstResults<T>(results: Record<string, T[]>): T[] {
  const [first] = Object.values(results);

  if (!first) throw new Error("A comparison needs at least one model.");

  return first;
}

/**
 * Categories people approved on this deployment's recent receipts. Product
 * names are household data: print them locally, never commit them.
 */
export const compareCategories = internalAction({
  args: { models: modelsArg, count: v.number() },
  returns: comparisonValidator,
  handler: async (ctx, args): Promise<Comparison> => {
    const labeled: {
      evidence: ClassificationEvidence;
      expected: string;
      read: string | null;
    }[] = await ctx.runQuery(internal.readingEvaluation.labeledCategories, {
      count: args.count,
    });

    const result = await compare(
      "approved categories",
      models(ctx, args.models),
      (client) =>
        categorize(
          client,
          labeled.map((item) => item.evidence),
        ),
    );

    return {
      cases: labeled.map((item, index) => ({
        suite: "approved categories",
        name: item.evidence.name,
        expected: item.expected,
        threshold: 0.5,
        corrected: item.read !== item.expected,
        outcomes: outcomes(result.results, index, (outcome) => outcome),
      })),
      timings: [result.timing],
    };
  },
});
