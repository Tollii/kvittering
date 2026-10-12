/// <reference types="vite/client" />
import { register as registerBetterAuth } from "@convex-dev/better-auth/test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { z } from "zod";
import appConfig from "../app.json";
import { api, components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  invitation,
  sharedHousehold,
  testUser,
} from "../src/lib/testing/households";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

type Backend = TestConvex<typeof schema>;

let applePrivateKey: string;

let applePublicKey: CryptoKey;

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );

  const der = Buffer.from(
    await crypto.subtle.exportKey("pkcs8", pair.privateKey),
  ).toString("base64");

  // Convex env values hold the .p8 file with escaped newlines.
  applePrivateKey = `-----BEGIN PRIVATE KEY-----\\n${der}\\n-----END PRIVATE KEY-----`;
  applePublicKey = pair.publicKey;
});

function setup() {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  registerBetterAuth(t);
  registerRateLimiter(t);

  return t;
}

const settle = (t: Backend) => t.finishAllScheduledFunctions(vi.runAllTimers);

async function receiptWithImage(
  t: Backend,
  member: ReturnType<typeof testUser>,
  householdId: Id<"households">,
  clientId: string,
) {
  const receiptId = await member.mutation(api.receipts.reserve, {
    clientId,
    householdId,
    imageCount: 1,
  });

  const storageId = await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob(["receipt"]));
    await ctx.db.insert("images", {
      receiptId,
      position: 0,
      storageId,
      sha256: clientId,
    });

    return storageId;
  });

  return { receiptId, storageId };
}

const appleRequest = z.instanceof(URLSearchParams);

const clientSecretClaims = z.object({
  iss: z.string(),
  sub: z.string(),
  aud: z.string(),
  exp: z.number(),
});

const jwtHeader = z.object({ kid: z.string() });

function decode<T>(schema: z.ZodType<T>, segment: string): T {
  return schema.parse(JSON.parse(Buffer.from(segment, "base64url").toString()));
}

/** Apple's token and revocation endpoints, which accept only a validly signed client secret. */
function appleServer(subject: string) {
  const revoked: string[] = [];

  const handler = async (url: string, init?: RequestInit) => {
    const body = appleRequest.parse(init?.body);

    const [header = "", claims = "", signature = ""] = (
      body.get("client_secret") ?? ""
    ).split(".");

    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      applePublicKey,
      Buffer.from(signature, "base64url"),
      new TextEncoder().encode(`${header}.${claims}`),
    );

    const secret = decode(clientSecretClaims, claims);

    if (
      !valid ||
      decode(jwtHeader, header).kid !== "key-id" ||
      secret.iss !== "team-id" ||
      secret.sub !== appConfig.expo.ios.bundleIdentifier ||
      secret.aud !== "https://appleid.apple.com" ||
      body.get("client_id") !== appConfig.expo.ios.bundleIdentifier
    )
      return Response.json({ error: "invalid_client" }, { status: 400 });

    if (url === "https://appleid.apple.com/auth/token") {
      if (body.get("code") !== "fresh-code")
        return Response.json({ error: "invalid_grant" }, { status: 400 });

      const idToken = [
        Buffer.from("{}").toString("base64url"),
        Buffer.from(JSON.stringify({ sub: subject })).toString("base64url"),
        "signature",
      ].join(".");

      return Response.json({
        access_token: "apple-access",
        refresh_token: "apple-refresh",
        id_token: idToken,
      });
    }

    if (url === "https://appleid.apple.com/auth/revoke") {
      revoked.push(body.get("token") ?? "");

      return new Response(null, { status: 200 });
    }

    return new Response(null, { status: 404 });
  };

  vi.stubGlobal("fetch", vi.fn(handler));

  return revoked;
}

function configureAppleKey() {
  vi.stubEnv("APNS_TEAM_ID", "team-id");
  vi.stubEnv("APPLE_SIGN_IN_KEY_ID", "key-id");
  vi.stubEnv("APPLE_SIGN_IN_PRIVATE_KEY", applePrivateKey);
}

/** A Better Auth user with a linked Apple ID and one session. */
async function appleUser(t: Backend) {
  const now = Date.now();

  return t.run(async (ctx) => {
    const user = z.object({ _id: z.string() }).parse(
      await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "user",
          data: {
            name: "Apple member",
            email: "relay@privaterelay.appleid.com",
            emailVerified: true,
            createdAt: now,
            updatedAt: now,
          },
        },
      }),
    );

    await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "account",
        data: {
          accountId: "apple-subject",
          providerId: "apple",
          userId: user._id,
          createdAt: now,
          updatedAt: now,
        },
      },
    });

    await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "session",
        data: {
          token: "session-token",
          userId: user._id,
          expiresAt: now + 3600_000,
          createdAt: now,
          updatedAt: now,
        },
      },
    });

    return user._id;
  });
}

async function authRecords(t: Backend, userId: string) {
  return t.run(async (ctx) => {
    const count = async (model: "user" | "account" | "session") =>
      z.object({ page: z.array(z.unknown()) }).parse(
        await ctx.runQuery(components.betterAuth.adapter.findMany, {
          model,
          where: [
            { field: model === "user" ? "_id" : "userId", value: userId },
          ],
          paginationOpts: { cursor: null, numItems: 10 },
        }),
      ).page.length;

    return {
      user: await count("user"),
      account: await count("account"),
      session: await count("session"),
    };
  });
}

it("keeps a shared household with the partner and removes the last member's household entirely", async () => {
  const t = setup();
  const { first, second, householdId } = await sharedHousehold(t);

  const oda = vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(null, { status: 200 })),
  );

  vi.stubGlobal("fetch", oda);

  const kept = await receiptWithImage(
    t,
    second,
    householdId,
    "account-receipt-0001",
  );

  // An upload the leaving member never finished, which nobody could complete or delete.
  const unfinished = await receiptWithImage(
    t,
    second,
    householdId,
    "account-receipt-0003",
  );

  await t.run((ctx) =>
    ctx.db.patch("receipts", kept.receiptId, { status: "reviewed" }),
  );

  const firstMember = await first.query(api.households.current, {});

  await t.run(async (ctx) => {
    const identity = firstMember?.member.identity ?? "";
    await ctx.db.insert("odaConnections", {
      identity,
      householdId,
      clientId: "kvitto-client",
      accessToken: "oda-access",
      accessExpiresAt: Date.now() + 3600_000,
      refreshToken: "oda-refresh",
      expired: false,
      importedCount: 0,
    });
    await ctx.db.insert("deviceSubscriptions", {
      identity,
      householdId,
      token: "ExponentPushToken[first]",
    });
  });

  await second.action(api.account.remove, {});
  await settle(t);

  await expect(second.query(api.households.current, {})).resolves.toBeNull();

  const remaining = await first.query(api.households.current, {});
  expect(remaining?.members.map((member) => member.name)).toEqual(["First"]);
  await expect(
    first.query(api.receipts.detail, { id: kept.receiptId }),
  ).resolves.not.toBeNull();
  await t.run(async (ctx) => {
    expect(await ctx.db.get("receipts", unfinished.receiptId)).toBeNull();
    expect(await ctx.storage.get(unfinished.storageId)).toBeNull();
  });

  // The person who left knows the old code, so it no longer admits anyone.
  await expect(
    testUser(t, "returning").mutation(api.households.join, { invitation }),
  ).rejects.toThrow("ugyldig");

  await first.action(api.account.remove, {});
  await settle(t);

  await expect(first.query(api.households.current, {})).resolves.toBeNull();
  // Oda is told to forget the sign-in.
  expect(oda).toHaveBeenCalledWith(
    "https://oda.com/o/revoke_token/",
    expect.anything(),
  );

  await t.run(async (ctx) => {
    expect(await ctx.db.get("households", householdId)).toBeNull();
    expect(await ctx.storage.get(kept.storageId)).toBeNull();

    for (const table of [
      "members",
      "receipts",
      "images",
      "receiptSummaries",
      "receiptSyncHeads",
      "odaConnections",
      "deviceSubscriptions",
    ] as const)
      expect(await ctx.db.query(table).take(1)).toEqual([]);
  });
});

it("revokes the linked Apple ID before deleting, and deletes nothing when it cannot", async () => {
  const t = setup();
  const userId = await appleUser(t);
  const member = testUser(t, userId);

  const { receiptId } = await (async () => {
    const householdId = await member.mutation(api.households.create, {
      name: "Alone",
      invitation: "0123456789abcdef0123456789abcdef",
    });

    return receiptWithImage(t, member, householdId, "account-receipt-0002");
  })();

  const untouched = async () => {
    await expect(authRecords(t, userId)).resolves.toEqual({
      user: 1,
      account: 1,
      session: 1,
    });
    await expect(
      member.query(api.receipts.detail, { id: receiptId }),
    ).resolves.not.toBeNull();
  };

  await expect(member.action(api.account.remove, {})).rejects.toThrow(
    "Bekreft med Apple",
  );
  await untouched();

  // Without the server key nothing can be revoked, so nothing is deleted.
  appleServer("apple-subject");
  await expect(
    member.action(api.account.remove, { appleAuthorizationCode: "fresh-code" }),
  ).rejects.toThrow("akkurat nå");
  await untouched();

  configureAppleKey();
  let revoked = appleServer("another-apple-subject");
  await expect(
    member.action(api.account.remove, { appleAuthorizationCode: "fresh-code" }),
  ).rejects.toThrow("Apple-kontoen som er koblet til");
  expect(revoked).toEqual([]);
  await untouched();

  revoked = appleServer("apple-subject");
  await expect(
    member.action(api.account.remove, { appleAuthorizationCode: "used-code" }),
  ).rejects.toThrow("utløpt");
  await untouched();

  await member.action(api.account.remove, {
    appleAuthorizationCode: "fresh-code",
  });
  await settle(t);

  expect(revoked).toEqual(["apple-refresh"]);
  await expect(authRecords(t, userId)).resolves.toEqual({
    user: 0,
    account: 0,
    session: 0,
  });
  await t.run(async (ctx) => {
    expect(await ctx.db.get("receipts", receiptId)).toBeNull();
  });
});
