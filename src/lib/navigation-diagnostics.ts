const screens = new Set([
  "",
  "(tabs)",
  "(tabs)/history",
  "(tabs)/inbox",
  "(tabs)/spending",
  "receipt/[id]",
  "analysis",
  "corrections",
  "product-linking",
  "settings",
  "shortcut-receipt",
]);

/** Accept file-based route names only; dynamic paths and parameters are not diagnostics. */
export function diagnosticScreen(segments: readonly string[]) {
  const name = segments.join("/");

  return screens.has(name) ? name || "(tabs)" : "unknown";
}
