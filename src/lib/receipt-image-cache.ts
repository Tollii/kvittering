import { Directory, File, Paths } from "expo-file-system";
import { convexSiteUrl, fetchAccessToken } from "./auth-client";
import { storageSuffix } from "./deployment-storage";
import type { Id } from "../../convex/_generated/dataModel";

const root = () =>
  new Directory(Paths.cache, `kvitto-receipt-images${storageSuffix}`);

const maximumBytes = 200 * 1024 * 1024;

const lifetime = 7 * 24 * 60 * 60_000;

let scope: string | null = null;

let generation = 0;

/** The OS can discard these copies. Originals remain in protected server storage. */
export function retainReceiptImageScope(
  owner: string | null,
  household?: Id<"households">,
) {
  const next =
    owner && household
      ? encodeURIComponent(JSON.stringify([owner, household]))
      : null;

  if (next !== scope) generation++;
  scope = next;
  const directory = root();

  if (!directory.exists) return;

  for (const item of directory.list()) {
    if (item.name !== next) item.delete();
  }
}

function scopedDirectory() {
  if (!scope) throw new Error("Husstanden er ikke klar.");

  return new Directory(root(), scope);
}

export function removeCachedReceiptImages(id: Id<"receipts">) {
  if (!scope) return;
  const directory = scopedDirectory();

  if (!directory.exists) return;

  for (const file of directory.list())
    if (file.name.startsWith(`${id}-`)) file.delete();
}

function trimImages(directory: Directory, retained: Set<string>) {
  const files = directory.list().filter((item) => item instanceof File);
  let bytes = files.reduce((sum, file) => sum + file.size, 0);

  for (const file of [...files].sort(
    (left, right) => (left.lastModified ?? 0) - (right.lastModified ?? 0),
  )) {
    if (retained.has(file.name)) continue;

    if (
      bytes > maximumBytes ||
      (file.lastModified ?? 0) < Date.now() - lifetime
    ) {
      bytes -= file.size;
      file.delete();
    }
  }
}

export async function cachedReceiptImages(id: Id<"receipts">, count: number) {
  const directory = scopedDirectory();
  const requestGeneration = generation;
  directory.create({ intermediates: true, idempotent: true });

  const files = Array.from(
    { length: count },
    (_, position) => new File(directory, `${id}-${position}.jpg`),
  );

  let token: string | undefined;

  for (const [position, file] of files.entries()) {
    if (
      file.exists &&
      file.size > 0 &&
      (file.lastModified ?? 0) >= Date.now() - lifetime
    )
      continue;
    token ??= await fetchAccessToken();

    if (requestGeneration !== generation)
      throw new Error("Husstanden er endret.");

    const temporary = new File(
      directory,
      `${id}-${position}-${Date.now()}.partial`,
    );

    try {
      await File.downloadFileAsync(
        `${convexSiteUrl}/receipt-image?receipt=${id}&position=${position}`,
        temporary,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (requestGeneration !== generation)
        throw new Error("Husstanden er endret.");

      if (temporary.size <= 0 || temporary.size > 10 * 1024 * 1024)
        throw new Error("Ugyldig bildestørrelse.");
      await temporary.move(file, { overwrite: true });
      trimImages(directory, new Set(files.map((image) => image.name)));
    } finally {
      if (temporary.exists && temporary.uri !== file.uri) temporary.delete();
    }
  }

  if (requestGeneration !== generation)
    throw new Error("Husstanden er endret.");
  trimImages(directory, new Set(files.map((file) => file.name)));

  return files.map((file) => file.uri);
}
