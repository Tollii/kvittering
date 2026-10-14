/**
 * Build 18 and earlier opened `kvitto:///(tabs)/inbox` from the Live Activity
 * and the "Åpne innboks" shortcut. Innboks is now the pinned section of the
 * Kvitteringer tab. The match also accepts the path without the `(tabs)`
 * group, a trailing slash or a query, which reach the same route.
 */
const retiredInbox = /^\/(?:\(tabs\)\/)?inbox\/?(?:[?#].*)?$/;

/** The route a system link should open, or the link itself when it is current. */
export function systemPathRoute(path: string): string {
  // The share extension's payload is not a route; expo-share-intent reads it itself.
  if (path.includes("dataUrl=")) return "/";

  const route = path.replace(/^[a-z][a-z\d+.-]*:\/\/[^/]*/i, "");

  return retiredInbox.test(route) ? "/(tabs)/receipts?show=pending" : path;
}
