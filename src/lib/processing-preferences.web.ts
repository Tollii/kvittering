import type { ProcessingEngine } from "./domain/processing-engine";
export const processingEngine = (): ProcessingEngine => "gpt";
export const useProcessingEngine = processingEngine;
export function setProcessingEngine(_value: ProcessingEngine) {}
