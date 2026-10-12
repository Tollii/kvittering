import { z } from "zod";
import appConfig from "../app.json";
import { env } from "./_generated/server";
import { appleJwt, fromBase64url } from "./appleJwt";
import { userError } from "./userErrors";

const apple = "https://appleid.apple.com";

/** Native sign-in codes are issued to the app's bundle identifier. */
const clientId = appConfig.expo.ios.bundleIdentifier;

const tokens = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  id_token: z.string(),
});

const identityClaims = z.object({ sub: z.string() });

const tokenError = z.object({ error: z.string() });

/** The subject of an identity token Apple returned from its token endpoint. */
function tokenSubject(idToken: string) {
  const payload = fromBase64url(idToken.split(".")[1] ?? "");

  return identityClaims.parse(JSON.parse(new TextDecoder().decode(payload)))
    .sub;
}

/** Apple's client secret: a short-lived token signed with a Sign in with Apple key. */
async function clientSecret() {
  // The APNs key and the Sign in with Apple key belong to the same team.
  const teamId = env.APNS_TEAM_ID;
  const keyId = env.APPLE_SIGN_IN_KEY_ID;
  const privateKey = env.APPLE_SIGN_IN_PRIVATE_KEY;

  if (!teamId || !keyId || !privateKey) return null;

  const issuedAt = Math.floor(Date.now() / 1000);

  return appleJwt({
    keyId,
    privateKey,
    claims: {
      iss: teamId,
      iat: issuedAt,
      exp: issuedAt + 300,
      aud: apple,
      sub: clientId,
    },
  });
}

/**
 * Revoke Kvitto's access to the person's Apple ID, as App Store review
 * requires when an account is deleted. Apple revokes only tokens, so a fresh
 * authorization code is exchanged first; its identity must be the linked
 * Apple account, which also confirms the person holds it.
 */
export async function revokeAppleAccess(code: string, appleAccountId: string) {
  const secret = await clientSecret();

  if (!secret) {
    console.error("account.apple_key_missing", {
      required: [
        "APNS_TEAM_ID",
        "APPLE_SIGN_IN_KEY_ID",
        "APPLE_SIGN_IN_PRIVATE_KEY",
      ],
    });

    throw userError("Kan ikke slette kontoen akkurat nå. Prøv igjen senere.");
  }

  const exchanged = await fetch(`${apple}/auth/token`, {
    method: "POST",
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!exchanged.ok) {
    const body: unknown = await exchanged.json().catch(() => null);

    if (tokenError.safeParse(body).data?.error === "invalid_grant")
      throw userError("Apple-bekreftelsen er utløpt. Prøv igjen.");

    throw new Error(
      `Apple refused the authorization code (${exchanged.status}).`,
    );
  }

  const issued = tokens.parse(await exchanged.json());

  // The token came straight from Apple over TLS, so its claims need no signature check.
  if (tokenSubject(issued.id_token) !== appleAccountId)
    throw userError("Bekreft med Apple-kontoen som er koblet til Kvitto.");

  const revoked = await fetch(`${apple}/auth/revoke`, {
    method: "POST",
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      token: issued.refresh_token ?? issued.access_token,
      token_type_hint: issued.refresh_token ? "refresh_token" : "access_token",
    }),
  });

  if (!revoked.ok)
    throw new Error(`Apple refused the revocation (${revoked.status}).`);
}
