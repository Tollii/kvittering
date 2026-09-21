import { requireOptionalNativeModule } from "expo";

export default requireOptionalNativeModule<{
  hasPurchaseWidget?: () => Promise<boolean>;
  supportsReceiptTips?: () => boolean;
  completeReceiptTip?: (kind: "matching" | "widget") => void;
  previewReceipts?: (urls: string[], token: string) => Promise<void>;
  indexReceipts?: (
    receipts: {
      id: string;
      title: string;
      detail: string;
      keywords: string[];
    }[],
  ) => Promise<void>;
  uploadReceiptImage?: (
    key: string,
    uri: string,
    address: string,
    headers: {
      Authorization: string;
      "Content-Type": string;
      "X-Kvitto-Client": string;
    },
  ) => Promise<{ status: number; body: string }>;
  retainUploadScope?: (scope: string | null) => void;
  forgetUploads?: (keys: string[]) => void;
  isDocumentScannerSupported?: () => boolean;
  scanDocument?: (maxPages: number) => Promise<string[] | null>;
  /** Render a local PDF into one JPEG per page, in page order. */
  renderPdf?(uri: string, maxPages: number): Promise<string[]>;
}>("ReceiptIntelligence");
