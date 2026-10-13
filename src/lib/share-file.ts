import { Directory, File, Paths } from "expo-file-system";
import { Share } from "react-native";

/**
 * Opens the share sheet for a text file. The file is removed once the sheet
 * closes, when the receiving app has its copy, so household data does not
 * stay behind after sign-out; a leftover from a crash goes on the next share.
 */
export async function shareTextFile(name: string, contents: string) {
  const directory = new Directory(Paths.cache, "kvitto-exports");

  if (directory.exists) directory.delete();
  directory.create();

  try {
    const file = new File(directory, name);
    file.create();
    file.write(contents);
    await Share.share({ url: file.uri });
  } finally {
    directory.delete();
  }
}
