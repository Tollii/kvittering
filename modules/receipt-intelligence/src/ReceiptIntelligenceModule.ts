import { requireOptionalNativeModule } from "expo";

export default requireOptionalNativeModule<{
  availability(): Promise<string | null>;
  suggestProductSearch?(name: string): Promise<string>;
  /** Render a local PDF into one JPEG per page, in page order. */
  renderPdf?(uri: string, maxPages: number): Promise<string[]>;
}>("ReceiptIntelligence");
