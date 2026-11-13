import ReceiptIntelligence from "../../modules/receipt-intelligence/src/ReceiptIntelligenceModule";
import { fetch as nativeFetch } from "expo/fetch";
import { Platform } from "react-native";
import type { ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { releaseError } from "./releases/client";
import { installedRelease } from "./releases/installed";
import { releaseMutation } from "./releases/requests";
import { convexSiteUrl, fetchAccessToken } from "./auth-client";
import { imageFile } from "./receipt-storage";
import type { UploadTransport } from "./upload-queue";
import { traced, traceHeaders } from "./tracing";

const tokenDeadlineMs = 30_000;

/**
 * The sign-in token for one upload. It has its own deadline, so a hung token
 * request fails as an ordinary error that counts toward the retry cap, and only
 * a stalled background transfer is joined by a later retry.
 */
async function uploadToken(id: Id<"receipts">, position: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          releaseError(
            new Error("Innloggingen svarte ikke. Prøv igjen."),
            "receipt.upload_token",
            { receiptId: id, position },
          ),
        ),
      tokenDeadlineMs,
    );
  });

  return Promise.race([fetchAccessToken(), deadline]).finally(() =>
    clearTimeout(timer),
  );
}

export function receiptUploadTransport(
  convex: ConvexReactClient,
  householdId: Id<"households">,
  active: () => boolean,
  scope: string,
): UploadTransport {
  return {
    // The background session hands a repeated upload the task still in flight.
    joinsPendingUploads: !!ReceiptIntelligence?.uploadReceiptImage,
    reserve: (entry) =>
      releaseMutation(convex, api.receipts.reserve, {
        clientId: entry.id,
        retryMetadata: true,
        imageCount: entry.images.length,
        householdId,
        backgroundUpload: !!ReceiptIntelligence?.uploadReceiptImage,
      }),
    upload: traced(
      "receipt-upload-transport.upload",
      async (id: Id<"receipts">, position: number, name: string) => {
        // Read before the first await: Hermes loses the active span after it.
        const trace = traceHeaders();
        const token = await uploadToken(id, position);

        if (!active())
          throw new Error(
            "Opplastingen fortsetter når du åpner appen med nett.",
          );

        const address = `${convexSiteUrl}/receipt-image?receipt=${id}&position=${position}`;

        const headers = {
          Authorization: `Bearer ${token}`,
          "Content-Type": "image/jpeg",
          "X-Kvitto-Client": JSON.stringify(installedRelease),
        };

        // The backend continues this trace, so both halves share one trace id.
        // Web leaves the headers off until every backend allows them in CORS.
        if (Platform.OS !== "web") Object.assign(headers, trace);

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
    ),
    complete: async (id, entry) => {
      await releaseMutation(convex, api.receipts.completeUpload, { id });
      ReceiptIntelligence?.forgetUploads?.(
        entry.images.map((_, position) => `${scope}:${id}:${position}`),
      );
    },
  };
}
