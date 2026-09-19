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
): UploadTransport {
  return {
    reserve: (entry) =>
      releaseMutation(convex, api.receipts.reserve, {
        clientId: entry.id,
        imageCount: entry.images.length,
        householdId,
      }),
    upload: async (id, position, name) => {
      const token = await fetchAccessToken();
      if (!active())
        throw new Error("Opplastingen fortsetter når du åpner appen med nett.");
      const response = await nativeFetch(
        `${convexSiteUrl}/receipt-image?receipt=${id}&position=${position}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "image/jpeg",
            "X-Kvitto-Client": JSON.stringify(installedRelease),
          },
          body: imageFile(name),
          signal: AbortSignal.timeout(60000),
        },
      ).catch((error) => {
        throw releaseError(error, "receipt.image_upload", {
          receiptId: id,
          position,
        });
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        if (data?.code)
          throw releaseError({ data }, "receipt.image_upload", {
            receiptId: id,
            position,
            status: response.status,
          });
        throw releaseError(
          new Error("Bildet kunne ikke lastes opp. Prøv igjen med nett."),
          "receipt.image_upload",
          { receiptId: id, position, status: response.status },
        );
      }
    },
    complete: (id) =>
      releaseMutation(convex, api.receipts.completeUpload, { id }),
  };
}
