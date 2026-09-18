import { Platform } from "react-native";
import { z } from "zod";
import ReceiptIntelligence from "../../modules/receipt-intelligence/src/ReceiptIntelligenceModule";
import { categories } from "./domain/categories";
import {
  extractionSchema,
  extractionInstructions,
  overlapInstructions,
  uncertaintyInstructions,
} from "./domain/receipt-extraction";
import type { FoundationResult } from "./domain/processing-engine";

export async function foundationUnavailableReason(): Promise<string | null> {
  if (!ReceiptIntelligence)
    return "Krever en iOS-bygging med Foundation Models. Ikke tilgjengelig i Expo Go eller nettleseren.";
  try {
    return await ReceiptIntelligence.availability();
  } catch {
    return "Apple Intelligence er ikke tilgjengelig nå.";
  }
}

/** Both recognition and classification stay on the device. Failures never switch engines. */
export async function recognizeWithFoundation(
  uris: string[],
): Promise<FoundationResult> {
  const reason = await foundationUnavailableReason();
  if (reason || !ReceiptIntelligence)
    throw new Error(reason ?? "Apple Intelligence er ikke tilgjengelig.");
  const started = Date.now();
  const raw = await ReceiptIntelligence.recognize(
    uris,
    [extractionInstructions, overlapInstructions, uncertaintyInstructions].join(
      "\n\n",
    ),
  );
  const extraction = extractionSchema.parse(JSON.parse(raw));
  const products = extraction.lines.filter((line) => line.kind === "product");
  const classifications: FoundationResult["classifications"] = [];
  const categoryList = categories
    .map(({ id, name }) => `${id}: ${name}`)
    .join("\n");
  for (let offset = 0; offset < products.length; offset += 6) {
    const batch = products.slice(offset, offset + 6);
    const response = await ReceiptIntelligence.classify(
      JSON.stringify({
        categories: categoryList,
        products: batch.map(({ id, name, brand, attributes }) => ({
          id,
          name,
          brand,
          attributes,
        })),
      }),
    );
    const parsed = z
      .object({
        items: z.array(
          z.object({
            id: z.string(),
            categoryId: z.string(),
            uncertain: z.boolean(),
          }),
        ),
      })
      .parse(JSON.parse(response));
    for (const product of batch) {
      const choices = parsed.items.filter((item) => item.id === product.id);
      if (
        choices.length !== 1 ||
        !categories.some((category) => category.id === choices[0].categoryId)
      )
        throw new Error(
          "Foundation Models ga en ugyldig kategori. Prøv å lese kvitteringen på nytt.",
        );
      classifications.push(choices[0]);
    }
  }
  return {
    extraction: JSON.stringify(extraction),
    classifications,
    durationMs: Date.now() - started,
    systemVersion: String(Platform.Version),
  };
}
