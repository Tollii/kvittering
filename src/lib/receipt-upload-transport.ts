import ReceiptIntelligence from "../../modules/receipt-intelligence/src/ReceiptIntelligenceModule";
import { fetch as nativeFetch } from "expo/fetch";
import type { ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { installedRelease, releaseError } from "./releases/client";
import { releaseMutation } from "./releases/requests";
import { convexSiteUrl, fetchAccessToken } from "./auth-client";
import { imageFile } from "./receipt-storage";
import type { UploadTransport } from "./upload-queue";

export function receiptUploadTransport(
  convex: ConvexReactClient,
  householdId: Id<"households">,
  active: () => boolean,
  scope: string,
): UploadTransport {
  return {
    reserve: (entry) =>
      releaseMutation(convex, api.receipts.reserve, {
        clientId: entry.id,
        retryMetadata: true,
        imageCount: entry.images.length,
        householdId,
        backgroundUpload: !!ReceiptIntelligence?.uploadReceiptImage,
      }),
    upload: async (id, position, name) => {
      const token = await fetchAccessToken();

      if (!active())
        throw new Error("Opplastingen fortsetter når du åpner appen med nett.");

      const address = `${convexSiteUrl}/receipt-image?receipt=${id}&position=${position}`;

      const headers = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "image/jpeg",
        "X-Kvitto-Client": JSON.stringify(installedRelease),
      };

      const response = await (
        ReceiptIntelligence?.uploadReceiptImage
          ? ReceiptIntelligence.uploadReceiptImage(
              `${scope}:${id}:${position}`,
              imageFile(name).uri,
              address,
              headers,
            )
          : nativeFetch(address, {
              method: "POST",
              headers,
              body: imageFile(name),
              signal: AbortSignal.timeout(60000),
            }).then(async (result) => ({
              status: result.status,
              body: await result.text(),
            }))
      ).catch((error) => {
        throw releaseError(error, "receipt.image_upload", {
          receiptId: id,
          position,
        });
      });

      if (response.status < 200 || response.status >= 300) {
        let data: unknown;

        try {
          data = JSON.parse(response.body);
        } catch {
          throw releaseError(
            new Error("Bildet kunne ikke lastes opp. Prøv igjen med nett."),
            "receipt.image_upload",
            { receiptId: id, position, status: response.status },
          );
        }

        throw releaseError({ data }, "receipt.image_upload", {
          receiptId: id,
          position,
          status: response.status,
        });
      }
    },
    complete: async (id, entry) => {
      await releaseMutation(convex, api.receipts.completeUpload, { id });
      ReceiptIntelligence?.forgetUploads?.(
        entry.images.map((_, position) => `${scope}:${id}:${position}`),
      );
    },
  };
}
