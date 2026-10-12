import { Directory, File, Paths } from "expo-file-system";
import { Share } from "react-native";

/**
 * Opens the share sheet for a text file. Each export replaces the last one,
 * so household data does not pile up in the cache.
 */
export async function shareTextFile(name: string, contents: string) {
  const directory = new Directory(Paths.cache, "kvitto-exports");

  if (directory.exists) directory.delete();
  directory.create();
  const file = new File(directory, name);
  file.create();
  file.write(contents);
  await Share.share({ url: file.uri });
}
