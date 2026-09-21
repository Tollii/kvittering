import { requireOptionalNativeModule } from "expo";

export default requireOptionalNativeModule<{
  isDocumentScannerSupported?: () => boolean;
  scanDocument?: (maxPages: number) => Promise<string[] | null>;
  /** Render a local PDF into one JPEG per page, in page order. */
  renderPdf?(uri: string, maxPages: number): Promise<string[]>;
}>("ReceiptIntelligence");
