import { afterEach, expect, it, vi } from "vitest";
import { kassalappFetch, CatalogRequestError } from "./transport";

// vi.mock is hoisted, so the import above still sees the mocked module.
// oxlint-disable-next-line anti-slop/no-module-mocking -- Replace the native SDK or environment boundary; application behavior remains under test.
vi.mock("../_generated/server", () => ({
  env: { KASSALAPP_API_KEY: "test-key" },
}));

afterEach(() => vi.unstubAllGlobals());

it("adapts OpenAPI boolean query values to Kassalapp's accepted encoding", async () => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(new Response('{"data":[]}', { status: 200 }));

  vi.stubGlobal("fetch", fetch);
  await kassalappFetch("/products?search=Stratos&unique=true");
  expect(String(fetch.mock.calls[0][0])).toBe(
    "https://kassal.app/api/v1/products?search=Stratos&unique=1",
  );
  expect(new Headers(fetch.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer test-key");
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
  await expect(kassalappFetch("/products")).rejects.toMatchObject({
    status: 429,
    retryAfterMs: 120000,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("", { status: 401 })),
  );
  await expect(kassalappFetch("/products")).rejects.toBeInstanceOf(
    CatalogRequestError,
  );
});
