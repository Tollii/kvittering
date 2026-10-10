// Serve an `expo export --platform web` directory for browser checks.
//
// expo-sqlite's web worker needs SharedArrayBuffer, which browsers enable only
// for cross-origin isolated pages. The local backend's HTTP routes are proxied
// under this origin, so authentication cookies and uploads need no CORS
// support that the iOS app does not use. Unknown paths fall back to the app
// shell so Expo Router can resolve deep links. The shell asks to cover the
// whole screen, as the iOS app does, so env(safe-area-inset-*) applies.
import { createReadStream, readFileSync, statSync } from "node:fs";
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

function coverScreen(path: string) {
  const html = readFileSync(path, "utf8").replace(
    'name="viewport" content="',
    'name="viewport" content="viewport-fit=cover, ',
  );

  // Without it, safe areas are zero and screenshots drift from iOS unnoticed.
  if (!html.includes("viewport-fit=cover"))
    throw new Error(`${path} has no viewport meta tag to extend.`);

  return html;
}

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

  const headers = {
    "Content-Type": types.get(extname(path)) ?? "application/octet-stream",
    "Cache-Control": "no-store",
    ...isolation,
  };

  if (extname(path) !== ".html") {
    response.writeHead(200, headers);
    // The file can vanish while tools/visual/build.sh swaps the directory.
    createReadStream(path)
      .on("error", () => response.destroy())
      .pipe(response);

    return;
  }

  try {
    const html = coverScreen(path);
    response.writeHead(200, headers).end(html);
  } catch (error) {
    // A missing shell is a build swap in progress; a missing viewport tag is a
    // template change. Either way, report it instead of serving a drifted page.
    response.writeHead(503, { "Retry-After": "1" }).end(String(error));
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Serving ${root} at http://127.0.0.1:${port}`);
});
