import { userErrorDataSchema } from "../src/lib/user-errors";
import { ConvexError, v } from "convex/values";
import { parse } from "convex-helpers/validators";
import { clientValidator } from "../src/lib/releases/policy";
import { httpRouter } from "convex/server";
import { env } from "./_generated/server";
import { httpAction } from "./serverFunctions";
import { internal } from "./_generated/api";
import { authComponent, createAuth } from "./auth";
import { registerMcpRoutes } from "./mcpHttp";
import { registerOdaRoutes } from "./odaHttp";
import { annotate, annotateFailure } from "../src/lib/tracing";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

registerMcpRoutes(http);

registerOdaRoutes(http);

const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function headers(request: Request) {
  return {
    "Access-Control-Allow-Origin":
      request.headers.get("Origin") === env.SITE_URL ? env.SITE_URL : "",
    Vary: "Origin",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, X-Kvitto-Client, traceparent, tracestate",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
  };
}

http.route({
  path: "/receipt-image",
  method: "OPTIONS",
  handler: httpAction(
    async (_ctx, request) =>
      new Response(null, { status: 204, headers: headers(request) }),
  ),
});

http.route({
  path: "/receipt-image",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const responseHeaders = headers(request);

    try {
      const url = new URL(request.url);
      const id = parse(v.id("receipts"), url.searchParams.get("receipt"));
      const position = Number(url.searchParams.get("position"));
      const metadata = request.headers.get("X-Kvitto-Client");

      annotate({
        "kvitto.receipt.id": id,
        "kvitto.receipt.image.position": position,
      });

      const client = metadata
        ? parse(clientValidator, JSON.parse(metadata))
        : undefined;

      await ctx.runQuery(internal.releasePolicy.check, {
        client,
        feature: "receiptProcessing",
      });

      const access = await ctx.runQuery(internal.receipts.imageAccess, {
        id,
        position,
      });

      if (access.image)
        return Response.json({ uploaded: true }, { headers: responseHeaders });

      if (access.receipt.status !== "uploading")
        return new Response("Opplasting er avsluttet.", {
          status: 409,
          headers: responseHeaders,
        });
      const type = request.headers.get("Content-Type")?.split(";")[0];

      if (!type || !acceptedImageTypes.has(type))
        return new Response("Bruk JPEG, PNG eller WebP.", {
          status: 415,
          headers: responseHeaders,
        });

      if (Number(request.headers.get("Content-Length")) > 10 * 1024 * 1024)
        return new Response("Bildet er for stort.", {
          status: 413,
          headers: responseHeaders,
        });
      const blob = await request.blob();

      if (blob.size > 10 * 1024 * 1024 || blob.size === 0)
        return new Response("Ugyldig bildestørrelse.", {
          status: 413,
          headers: responseHeaders,
        });
      annotate({
        "kvitto.receipt.image.bytes": blob.size,
        "kvitto.receipt.image.type": type,
      });
      const storageId = await ctx.storage.store(blob);

      try {
        await ctx.runMutation(internal.receipts.attachImage, {
          id,
          position,
          storageId,
          client,
        });
      } catch (error) {
        await ctx.storage.delete(storageId);
        throw error;
      }

      return Response.json({ uploaded: true }, { headers: responseHeaders });
    } catch (error) {
      // The response states the failure; the request's line keeps its kind.
      annotateFailure("receipt.image_upload", error);

      // Installed upload clients read only release-policy errors from JSON bodies.
      if (
        error instanceof ConvexError &&
        !userErrorDataSchema.safeParse(error.data).success
      )
        return Response.json(error.data, {
          status: 409,
          headers: responseHeaders,
        });

      return new Response(
        "Bildet kunne ikke lagres. Kontroller innloggingen.",
        {
          status: 403,
          headers: responseHeaders,
        },
      );
    }
  }),
});

http.route({
  path: "/receipt-image",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const url = new URL(request.url);

      const { image } = await ctx.runQuery(internal.receipts.imageAccess, {
        id: parse(v.id("receipts"), url.searchParams.get("receipt")),
        position: Number(url.searchParams.get("position")),
      });

      if (!image)
        return new Response(null, { status: 404, headers: headers(request) });
      const blob = await ctx.storage.get(image.storageId);

      return new Response(blob, {
        headers: {
          ...headers(request),
          "Content-Type": blob?.type ?? "image/jpeg",
        },
      });
    } catch {
      // Handled: a malformed or unauthorized request gets the same 403, so it reveals nothing.
      return new Response(null, { status: 403, headers: headers(request) });
    }
  }),
});

export default http;
