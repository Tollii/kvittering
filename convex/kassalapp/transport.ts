import { env } from "../_generated/server";

export class CatalogRequestError extends Error {
  constructor(
    public status: number,
    public retryAfterMs = 0,
  ) {
    super(`Kassalapp svarte med status ${status}.`);
  }
}

/** Returns the Retry-After delay in milliseconds, or 0 when the header is absent or not valid. */
function retryAfterMs(retry: string | null): number {
  if (!retry) return 0;

  const delay = /^\d+$/.test(retry)
    ? Number(retry) * 1000
    : Date.parse(retry) - Date.now();

  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}

/** Called by the catalog worker; credentials remain on the server. */
export async function kassalappFetch<T>(
  path: string,
  options?: RequestInit & { fetch?: typeof fetch },
): Promise<T> {
  const key = env.KASSALAPP_API_KEY;

  if (!key) throw new CatalogRequestError(401);
  const url = new URL(`https://kassal.app/api/v1${path}`);

  // Kassalapp accepts boolean query parameters as 1/0, despite the OpenAPI schema.
  for (const [name, value] of url.searchParams) {
    if (value === "true" || value === "false")
      url.searchParams.set(name, value === "true" ? "1" : "0");
  }

  const { fetch: request, ...requestOptions } = options ?? {};

  if (!request)
    throw new Error("Catalog requests require a quota-controlled transport.");

  const response = await request(url, {
    ...requestOptions,
    signal: AbortSignal.timeout(15000),
    headers: {
      ...options?.headers,
      Accept: "application/json",
      Authorization: `Bearer ${key}`,
    },
  });

  if (!response.ok)
    throw new CatalogRequestError(
      response.status,
      retryAfterMs(response.headers.get("Retry-After")),
    );

  // SAFETY: Generated client types describe transport data only; worker schemas parse every result before domain use.
  return response.json() as Promise<T>;
}
