import { Directory, File, Paths } from "expo-file-system";
import { randomUUID } from "expo-crypto";
import { convexSiteUrl, fetchAccessToken } from "./auth-client";
import {
  recognizeWithFoundation,
  foundationUnavailableReason,
} from "./foundation-recognition";
import type { Receipt } from "./domain/insights";

/** Use the stored original images for an engine comparison, then remove temporary files. */
export async function rereadWithFoundation(receipt: Receipt) {
  const reason = await foundationUnavailableReason();
  if (reason) throw new Error(reason);
  const token = await fetchAccessToken();
  if (!token) throw new Error("Logg inn for å lese kvitteringen.");
  const directory = new Directory(
    Paths.cache,
    `receipt-comparison-${randomUUID()}`,
  );
  directory.create({ intermediates: true });
  try {
    const uris: string[] = [];
    for (let position = 0; position < receipt.imageCount; position++) {
      const file = await File.downloadFileAsync(
        `${convexSiteUrl}/receipt-image?receipt=${receipt._id}&position=${position}`,
        new File(directory, `${position}.jpg`),
        { headers: { Authorization: `Bearer ${token}` } },
      );
      uris.push(file.uri);
    }
    return await recognizeWithFoundation(uris);
  } finally {
    directory.delete();
  }
}
