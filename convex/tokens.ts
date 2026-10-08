/** Random URL-safe text with 256 bits of entropy, for OAuth state and secrets. */
export function randomToken() {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

/** Hex SHA-256, for storing a high-entropy secret without keeping it. */
export async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
