import { requireOptionalNativeModule } from "expo";

export default requireOptionalNativeModule<{
  availability(): Promise<string | null>;
  recognize(uris: string[], instructions: string): Promise<string>;
  classify(prompt: string): Promise<string>;
}>("ReceiptIntelligence");
