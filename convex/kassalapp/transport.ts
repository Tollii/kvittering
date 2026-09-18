import { env } from "../_generated/server";

export class CatalogRequestError extends Error {
  constructor(
    public status: number,
    public retryAfterMs = 0,
  ) {
    super(`Kassalapp svarte med status ${status}.`);
  }
}

/** Called by the catalog worker; credentials remain on the server. */
export async function kassalappFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const key = env.KASSALAPP_API_KEY;
  if (!key) throw new CatalogRequestError(401);
  const url = new URL(`https://kassal.app/api/v1${path}`);
  // Kassalapp accepts boolean query parameters as 1/0, despite the OpenAPI schema.
  for (const [name, value] of url.searchParams) {
    if (value === "true" || value === "false")
      url.searchParams.set(name, value === "true" ? "1" : "0");
  }
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(15000),
    headers: {
      ...options?.headers,
      Accept: "application/json",
      Authorization: `Bearer ${key}`,
    },
  });
  if (!response.ok) {
    const retry = response.headers.get("Retry-After");
    const delay = retry
      ? /^\d+$/.test(retry)
        ? Number(retry) * 1000
        : Date.parse(retry) - Date.now()
      : 0;
    throw new CatalogRequestError(
      response.status,
      Number.isFinite(delay) ? Math.max(0, delay) : 0,
    );
  }
  return response.json() as Promise<T>;
}
