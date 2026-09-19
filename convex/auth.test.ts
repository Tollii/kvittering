/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
        "http://192.168.1.20:8081",
        "exp-malicious://192.168.1.20:8081",
      ]) {
        expect(auth.isTrustedOrigin(origin)).toBe(false);
      }
    });
  },
);
