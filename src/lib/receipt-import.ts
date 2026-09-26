import type { createImportQueue } from "./capture-import";
import { soleElement } from "./domain/collections";
import { Image } from "react-native";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import ReceiptIntelligence from "../../modules/receipt-intelligence/src/ReceiptIntelligenceModule";

import { maxReceiptImages } from "./domain/receipt-images";
import { UserError } from "./user-errors";

export { maxReceiptImages } from "./domain/receipt-images";

export type ImportedFile = {
  uri: string;
  mimeType?: string | null;
  name?: string | null;
  width?: number | null;
  height?: number | null;
};

export function isPdf(file: ImportedFile) {
  return (
    file.mimeType === "application/pdf" ||
    /\.pdf$/i.test(file.name ?? "") ||
    /\.pdf($|\?)/i.test(file.uri)
  );
}

/** Downscale and re-encode as JPEG so uploads stay small and uniform. */
export async function prepareImage(
  uri: string,
  width?: number | null,
  height?: number | null,
) {
  let w = width ?? 0;
  let h = height ?? 0;

  if (!w || !h) {
    ({ w, h } = await new Promise<{ w: number; h: number }>((resolve) =>
      Image.getSize(
        uri,
        (sw, sh) => resolve({ w: sw, h: sh }),
        () => resolve({ w: 0, h: 0 }),
      ),
    ));
  }

  const image = ImageManipulator.manipulate(uri);

  if (Math.max(w, h) > 2400)
    image.resize(w > h ? { width: 2400 } : { height: 2400 });
  const rendered = await image.renderAsync();

  const result = await rendered.saveAsync({
    compress: 0.85,
    format: SaveFormat.JPEG,
  });

  rendered.release();
  image.release();

  return result.uri;
}

/**
 * Turn shared or picked files into receipt images. A PDF becomes one image per
 * page; those pages belong to the same receipt, so the caller is told when a
 * single multi-page document was imported.
 */
export async function importReceiptFiles(
  files: ImportedFile[],
  room = maxReceiptImages,
): Promise<{ uris: string[]; singleDocument: boolean }> {
  room = Math.min(room, maxReceiptImages);

  if (!Number.isInteger(room) || room < 1 || files.length > room)
    throw new UserError({
      code: "REJECTED",
      message: `Maks ${maxReceiptImages} bilder`,
    });

  if (!files.length) return { uris: [], singleDocument: false };
  const uris: string[] = [];

  for (const file of files) {
    if (isPdf(file)) {
      if (!ReceiptIntelligence?.renderPdf)
        throw new UserError({
          code: "REJECTED",
          message: "PDF-kvitteringer krever en oppdatert versjon av appen.",
        });

      const pages = await ReceiptIntelligence.renderPdf(
        file.uri,
        room - uris.length,
      );

      uris.push(...pages);
    } else if (!file.mimeType || file.mimeType.startsWith("image/")) {
      uris.push(await prepareImage(file.uri, file.width, file.height));
    } else {
      throw new UserError({
        code: "REJECTED",
        message: "Kvitto kan lese bilder og PDF-filer.",
      });
    }

    if (uris.length > room)
      throw new UserError({
        code: "REJECTED",
        message: `Maks ${maxReceiptImages} bilder`,
      });
  }

  const only = soleElement(files);

  return {
    uris,
    singleDocument: !!only && isPdf(only) && uris.length > 1,
  };
}

/** Retain the original files until capture accepts every rendered image. */
export async function importPendingFiles(
  queue: ReturnType<typeof createImportQueue>,
  id: number,
  room: number,
  receive: (imported: Awaited<ReturnType<typeof importReceiptFiles>>) => void,
) {
  const batch = queue.claim(id);

  if (!batch) return;

  try {
    const imported = await importReceiptFiles(batch.files, room);
    receive(imported);
    queue.finish(id, "completed");
  } catch (error) {
    queue.finish(id, "failed");
    throw error;
  }
}
