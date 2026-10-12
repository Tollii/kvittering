/**
 * Links the installed app or the system may still open after an update.
 * Build 18 and earlier opened `(tabs)/inbox` from the Live Activity and the
 * "Åpne innboks" shortcut; Innboks and Historikk are now the Kvitteringer tab.
 */
const retiredTab =
  /^\/(?:\(tabs\)\/)?(inbox|history)(?:\/index)?\/?(?:[?#].*)?$/;

/** The route a system link should open, or the link itself when it is current. */
export function systemPathRoute(path: string): string {
  // The share extension's payload is not a route; expo-share-intent reads it itself.
  if (path.includes("dataUrl=")) return "/";

  const route = path.replace(/^[a-z][a-z\d+.-]*:\/\/[^/]*/i, "");
  const tab = retiredTab.exec(route)?.[1];

  if (tab === "inbox") return "/(tabs)/receipts?show=pending";

  return tab === "history" ? "/(tabs)/receipts" : path;
}
