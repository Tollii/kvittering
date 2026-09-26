import { present } from "../../src/lib/testing/receipts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { kassalappFetch, CatalogRequestError } from "./transport";

beforeEach(() => vi.stubEnv("KASSALAPP_API_KEY", "test-key"));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("adapts OpenAPI boolean query values to Kassalapp's accepted encoding", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(new Response('{"data":[]}', { status: 200 }));

  vi.stubGlobal("fetch", fetch);
  await kassalappFetch("/products?search=Stratos&unique=true", {
    fetch: globalThis.fetch,
  });
  expect(new Request(present(fetch.mock.calls[0])[0]).url).toBe(
    "https://kassal.app/api/v1/products?search=Stratos&unique=1",
  );
  expect(
    new Headers(present(fetch.mock.calls[0])[1]?.headers).get("Authorization"),
  ).toBe("Bearer test-key");
});

it("retains the rate-limit status and Retry-After delay", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        new Response("", { status: 429, headers: { "Retry-After": "120" } }),
      ),
  );
  await expect(
    kassalappFetch("/products", { fetch: globalThis.fetch }),
  ).rejects.toMatchObject({
    status: 429,
    retryAfterMs: 120000,
  });
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response("", { status: 401 })),
  );
  await expect(
    kassalappFetch("/products", { fetch: globalThis.fetch }),
  ).rejects.toBeInstanceOf(CatalogRequestError);
});
