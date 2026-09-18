import { Image } from "react-native";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import ReceiptIntelligence from "../../modules/receipt-intelligence/src/ReceiptIntelligenceModule";

export const maxReceiptImages = 8;

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
  if (!files.length) return { uris: [], singleDocument: false };
  const uris: string[] = [];
  for (const file of files) {
    if (isPdf(file)) {
      if (!ReceiptIntelligence?.renderPdf)
        throw new Error(
          "PDF-kvitteringer krever en oppdatert versjon av appen.",
        );
      const pages = await ReceiptIntelligence.renderPdf(file.uri, room);
      uris.push(...pages);
    } else if (!file.mimeType || file.mimeType.startsWith("image/")) {
      uris.push(await prepareImage(file.uri, file.width, file.height));
    } else {
      throw new Error("Kvitto kan lese bilder og PDF-filer.");
    }
    if (uris.length > room) throw new Error(`Maks ${maxReceiptImages} bilder`);
  }
  return {
    uris,
    singleDocument: files.length === 1 && isPdf(files[0]) && uris.length > 1,
  };
}
