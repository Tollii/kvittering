/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { register as registerBetterAuth } from "@convex-dev/better-auth/test";
import { internal } from "./_generated/api";
import { createAuth } from "./auth";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  // Convex's runtime does not use the local Metro development mode.
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("CONVEX_SITE_URL", "https://auth-test.convex.site");
  vi.stubEnv(
    "BETTER_AUTH_SECRET",
    "auth-origin-test-secret-at-least-32-characters",
  );
  vi.stubEnv("SITE_URL", "https://kvitto.example");
});

afterEach(() => vi.unstubAllEnvs());

it.each([undefined, "false", "true"])(
  "permits Expo Go only when explicitly enabled (%s)",
  async (setting) => {
    vi.stubEnv("ALLOW_EXPO_GO", setting);
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const auth = await createAuth(ctx).$context;

      for (const origin of [
        "exp://192.168.1.20:8081/--/",
        "exp://10.0.0.5:8082",
        "exp://localhost:8081",
        "exp://test.exp.direct/--/",
      ]) {
        expect(auth.isTrustedOrigin(origin)).toBe(setting === "true");
      }

      expect(auth.isTrustedOrigin("kvitto://")).toBe(true);
      expect(auth.isTrustedOrigin("https://kvitto.example")).toBe(true);

      for (const origin of [
        "https://untrusted.example",
        // eslint-disable-next-line sonarjs/no-clear-text-protocols -- The test verifies that an insecure origin is rejected.
        "http://192.168.1.20:8081",
        "exp-malicious://192.168.1.20:8081",
      ]) {
        expect(auth.isTrustedOrigin(origin)).toBe(false);
      }
    });
  },
);

it("toggles email registration while existing email accounts can still sign in", async () => {
  const t = convexTest(schema, modules);
  registerBetterAuth(t);

  const body = {
    name: "Test member",
    email: "member@example.com",
    password: "test-password-123456",
  };

  const signup = () =>
    t.fetch("/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "kvitto://" },
      body: JSON.stringify(body),
    });

  expect((await signup()).status).toBe(403);

  for (const platform of ["ios", "android"] as const)
    await t.mutation(internal.featureFlags.set, {
      platform,
      name: "emailSignUp",
      enabled: true,
      expectedRevision: 0,
      operator: "test",
      reason: "Enable registration",
    });

  expect((await signup()).status).toBe(200);
  await t.mutation(internal.featureFlags.set, {
    platform: "ios",
    name: "emailSignUp",
    enabled: false,
    expectedRevision: 1,
    operator: "test",
    reason: "Disable registration",
  });
  expect((await signup()).status).toBe(403);

  const signin = await t.fetch("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "kvitto://" },
    body: JSON.stringify({ email: body.email, password: body.password }),
  });

  expect(signin.status).toBe(200);
});
