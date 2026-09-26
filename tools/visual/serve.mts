// Serve an `expo export --platform web` directory for browser checks.
//
// expo-sqlite's web worker needs SharedArrayBuffer, which browsers enable only
// for cross-origin isolated pages. The local backend's HTTP routes are proxied
// under this origin, so authentication cookies and uploads need no CORS
// support that the iOS app does not use. Unknown paths fall back to the app
// shell so Expo Router can resolve deep links.
import { createReadStream, statSync } from "node:fs";
import { createServer, request as forward } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "build/visual/web");

const port = Number(process.argv[3] ?? 8081);

const site = new URL(process.argv[4] ?? "http://127.0.0.1:3211");

const proxied = ["/api/auth/", "/receipt-image"];

const types = new Map(
  Object.entries({
    ".css": "text/css",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".js": "text/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".ttf": "font/ttf",
    ".wasm": "application/wasm",
  }),
);

const isolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

function file(path: string) {
  try {
    return statSync(path).isFile() ? path : undefined;
  } catch {
    return undefined;
  }
}

createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost");

  if (proxied.some((prefix) => url.pathname.startsWith(prefix))) {
    const upstream = forward(
      new URL(url.pathname + url.search, site),
      {
        method: request.method,
        headers: { ...request.headers, host: site.host },
      },
      (reply) => {
        response.writeHead(reply.statusCode ?? 502, {
          ...reply.headers,
          ...isolation,
        });
        reply.pipe(response);
      },
    );

    upstream.on("error", () => response.writeHead(502).end());
    request.pipe(upstream);

    return;
  }

  const requested = join(root, normalize(decodeURIComponent(url.pathname)));

  const path =
    (requested.startsWith(root) &&
      (file(requested) ?? file(join(requested, "index.html")))) ||
    join(root, "index.html");

  response.writeHead(200, {
    "Content-Type": types.get(extname(path)) ?? "application/octet-stream",
    "Cache-Control": "no-store",
    ...isolation,
  });
  createReadStream(path).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`Serving ${root} at http://127.0.0.1:${port}`);
});
