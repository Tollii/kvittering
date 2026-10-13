/** Base64url without padding, as JSON Web Tokens use. */
export function toBase64url(bytes: Uint8Array) {
  return btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export function fromBase64url(text: string) {
  return Uint8Array.from(
    atob(text.replaceAll("-", "+").replaceAll("_", "/")),
    (character) => character.codePointAt(0) ?? 0,
  );
}

const encodeJson = (value: Record<string, string | number>) =>
  toBase64url(new TextEncoder().encode(JSON.stringify(value)));

/** The PKCS #8 body of an Apple .p8 key; env values may carry escaped newlines. */
function pkcs8(pem: string) {
  return fromBase64url(
    pem
      .replaceAll(String.raw`\n`, "\n")
      .replaceAll(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
      .replaceAll(/\s/g, ""),
  );
}

/**
 * An ES256 token signed with an Apple .p8 key, as APNs and Sign in with
 * Apple expect. WebCrypto runs in both Convex runtimes and returns the raw
 * r||s signature that JWS uses.
 */
export async function appleJwt({
  keyId,
  privateKey,
  claims,
}: Readonly<{
  keyId: string;
  privateKey: string;
  claims: Record<string, string | number>;
}>) {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8(privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const message = `${encodeJson({ alg: "ES256", kid: keyId })}.${encodeJson(claims)}`;

  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(message),
  );

  return `${message}.${toBase64url(new Uint8Array(signature))}`;
}
