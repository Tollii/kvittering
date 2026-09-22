/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { register } from "@convex-dev/better-auth/test";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import schema from "./schema";
import { components } from "./_generated/api";
import type { createAuth } from "./auth";

type AuthenticationRequest =
  | NonNullable<
      Parameters<ReturnType<typeof createAuth>["api"]["signInSocial"]>[0]
    >["body"]
  | NonNullable<
      Parameters<ReturnType<typeof createAuth>["api"]["signUpEmail"]>[0]
    >["body"];

const modules = import.meta.glob("./**/*.ts");

const signedIn = z.object({
  user: z.object({ id: z.string(), name: z.string(), email: z.string() }),
});

let signingKey: CryptoKey;

let publicKey: JsonWebKey;

let clientNumber = 0;

beforeAll(async () => {
  const keys = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );

  signingKey = keys.privateKey;
  publicKey = await crypto.subtle.exportKey("jwk", keys.publicKey);
});

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("CONVEX_SITE_URL", "https://auth-test.convex.site");
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "apple-auth-test-secret-at-least-32-characters",
  );
  vi.stubGlobal("fetch", async () =>
    Response.json({
      keys: [{ ...publicKey, kid: "apple-test", alg: "RS256" }],
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function identityToken({
  email = "member@privaterelay.appleid.com",
  audience = "no.tolnes.kvitto",
  nonce = "3a461e0943140fad72dae7438017ced94863859971a272ea51e87fa0ae2914b8",
  issuer = "https://appleid.apple.com",
  expiresAt = Math.floor(Date.now() / 1000) + 300,
} = {}) {
  const encoder = new TextEncoder();

  const header = base64url(
    encoder.encode(JSON.stringify({ alg: "RS256", kid: "apple-test" })),
  );

  const payload = base64url(
    encoder.encode(
      JSON.stringify({
        iss: issuer,
        aud: audience,
        sub: "apple-member",
        email,
        email_verified: "true",
        nonce,
        iat: Math.floor(Date.now() / 1000),
        exp: expiresAt,
      }),
    ),
  );

  const message = `${header}.${payload}`;

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signingKey,
    encoder.encode(message),
  );

  return `${message}.${base64url(new Uint8Array(signature))}`;
}

function authentication() {
  const t = convexTest(schema, modules);
  clientNumber += 1;
  const address = `192.0.2.${clientNumber}`;

  register(t);

  return {
    t,
    post: (path: string, body: AuthenticationRequest, cookie = "") =>
      t.fetch(`/api/auth/${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "kvitto://",
          Cookie: cookie,
          "X-Forwarded-For": address,
        },
        body: JSON.stringify(body),
      }),
  };
}

function sessionCookie(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

it("creates an Apple account and retains its identity and first name on later login", async () => {
  const { post } = authentication();
  const token = await identityToken();

  const first = await post("sign-in/social", {
    provider: "apple",
    idToken: {
      token,
      nonce: "native-request",
      user: { name: { firstName: "Ada", lastName: "Lovelace" } },
    },
  });

  expect(first.status).toBe(200);
  const account = signedIn.parse(await first.json());

  expect(account.user).toMatchObject({
    name: "Ada Lovelace",
    email: "member@privaterelay.appleid.com",
  });
  expect(sessionCookie(first)).toContain("session_token=");

  const next = await post("sign-in/social", {
    provider: "apple",
    idToken: { token, nonce: "native-request" },
  });

  expect(next.status).toBe(200);
  expect(signedIn.parse(await next.json()).user).toEqual(account.user);
});

it.each([
  { audience: "another.application" },
  { issuer: "https://another.example" },
  { nonce: "another-request" },
  { expiresAt: 1 },
])(
  "rejects an invalid Apple token (%j) without creating an account",
  async (claims) => {
    const { t, post } = authentication();
    const token = await identityToken(claims);

    const response = await post("sign-in/social", {
      provider: "apple",
      idToken: { token, nonce: "native-request" },
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "INVALID_TOKEN" });
    expect(
      await t.run((ctx) =>
        ctx.runQuery(components.betterAuth.adapter.findOne, {
          model: "account",
        }),
      ),
    ).toBeNull();
  },
);

it("rejects a token with a modified signature", async () => {
  const { post } = authentication();
  const signedToken = await identityToken();

  const token = signedToken
    .split(".")
    .map((part, index) =>
      index === 2
        ? `${part.startsWith("A") ? "B" : "A"}${part.slice(1)}`
        : part,
    )
    .join(".");

  const response = await post("sign-in/social", {
    provider: "apple",
    idToken: { token, nonce: "native-request" },
  });

  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ code: "INVALID_TOKEN" });
});

it("requires an existing session to link Apple", async () => {
  const { post } = authentication();
  const token = await identityToken();

  const response = await post("link-social", {
    provider: "apple",
    idToken: { token, nonce: "native-request" },
  });

  expect(response.status).toBe(401);
});

it("requires explicit linking and preserves email login after linking a private Apple address", async () => {
  const { post } = authentication();

  const emailCredentials = {
    email: "ada@example.com",
    password: crypto.randomUUID(),
    name: "Ada",
  };

  const registration = await post("sign-up/email", emailCredentials);

  expect(registration.status).toBe(200);
  const original = signedIn.parse(await registration.json());
  const sameEmailToken = await identityToken({ email: emailCredentials.email });

  const implicitLink = await post("sign-in/social", {
    provider: "apple",
    idToken: { token: sameEmailToken, nonce: "native-request" },
  });

  expect(implicitLink.status).toBe(401);
  expect(await implicitLink.json()).toMatchObject({ code: "OAUTH_LINK_ERROR" });

  const token = await identityToken();

  const linked = await post(
    "link-social",
    { provider: "apple", idToken: { token, nonce: "native-request" } },
    sessionCookie(registration),
  );

  expect(linked.status).toBe(200);

  const appleLogin = await post("sign-in/social", {
    provider: "apple",
    idToken: { token, nonce: "native-request" },
  });

  const emailLogin = await post("sign-in/email", emailCredentials);

  expect(appleLogin.status).toBe(200);
  expect(emailLogin.status).toBe(200);
  expect(signedIn.parse(await appleLogin.json()).user.id).toBe(
    original.user.id,
  );
  expect(signedIn.parse(await emailLogin.json()).user.id).toBe(
    original.user.id,
  );
});

it("rejects linking an Apple identity already owned by another account", async () => {
  const { t, post } = authentication();
  const token = await identityToken();

  const apple = await post("sign-in/social", {
    provider: "apple",
    idToken: { token, nonce: "native-request" },
  });

  const other = await post("sign-up/email", {
    email: "other@example.com",
    password: crypto.randomUUID(),
    name: "Other member",
  });

  expect(apple.status).toBe(200);
  expect(other.status).toBe(200);

  const linked = await post(
    "link-social",
    { provider: "apple", idToken: { token, nonce: "native-request" } },
    sessionCookie(other),
  );

  expect(linked.ok).toBe(false);

  const accounts = await t.run((ctx) =>
    ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "account",
      where: [{ field: "providerId", value: "apple" }],
      paginationOpts: { cursor: null, numItems: 10 },
    }),
  );

  expect(accounts.page).toHaveLength(1);
  expect(accounts.page[0].userId).toBe(
    signedIn.parse(await apple.json()).user.id,
  );
});
