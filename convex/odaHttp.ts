import type { HttpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { errorDetails } from "../src/lib/diagnostics";
import { odaCallbackUrl } from "./oda";
import {
  exchangeOdaCode,
  odaAuthorizationUrl,
  pkceChallenge,
  randomToken,
  registerOdaClient,
} from "./odaApi";

const noStore = { "Cache-Control": "no-store" };

const page = (text: string, status = 400) =>
  new Response(text, {
    status,
    headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" },
  });

const back = (returnUrl: string, status: string) => {
  const url = new URL(returnUrl);

  url.searchParams.set("status", status);

  return new Response(null, {
    status: 302,
    headers: { ...noStore, Location: url.toString() },
  });
};

/** The browser half of signing in at Oda: send the person there, then take the answer. */
export function registerOdaRoutes(http: HttpRouter) {
  http.route({
    path: "/oda/authorize",
    method: "GET",
    handler: httpAction(async (ctx, request) => {
      const requestId = new URL(request.url).searchParams.get("request") ?? "";

      const authorization = await ctx.runQuery(internal.oda.authorization, {
        request: requestId,
      });

      if (!authorization || authorization.expired || authorization.started)
        return page(
          "Innloggingen er utløpt. Gå tilbake til Kvitto og prøv igjen.",
        );

      const redirectUri = odaCallbackUrl();

      let clientId = await ctx.runQuery(internal.oda.registeredClient, {
        redirectUri,
      });

      if (!clientId) {
        clientId = await registerOdaClient(redirectUri);
        await ctx.runMutation(internal.oda.saveClient, {
          redirectUri,
          clientId,
        });
      }

      const state = randomToken();
      const verifier = randomToken();

      if (
        !(await ctx.runMutation(internal.oda.beginAuthorization, {
          request: requestId,
          state,
          verifier,
        }))
      )
        return page(
          "Innloggingen er utløpt. Gå tilbake til Kvitto og prøv igjen.",
        );

      return new Response(null, {
        status: 302,
        headers: {
          ...noStore,
          Location: odaAuthorizationUrl({
            clientId,
            redirectUri,
            state,
            challenge: await pkceChallenge(verifier),
          }),
        },
      });
    }),
  });

  http.route({
    path: "/oda/callback",
    method: "GET",
    handler: httpAction(async (ctx, request) => {
      const params = new URL(request.url).searchParams;

      const authorization = await ctx.runMutation(
        internal.oda.completeAuthorization,
        { state: params.get("state") ?? "" },
      );

      if (!authorization)
        return page(
          "Innloggingen er utløpt. Gå tilbake til Kvitto og prøv igjen.",
        );

      const code = params.get("code");

      if (!code || authorization.expired)
        return back(
          authorization.returnUrl,
          params.get("error") === "access_denied" ? "cancelled" : "failed",
        );

      try {
        const redirectUri = odaCallbackUrl();

        const clientId = await ctx.runQuery(internal.oda.registeredClient, {
          redirectUri,
        });

        if (!clientId) throw new Error("Kvitto is not registered at Oda.");

        const tokens = await exchangeOdaCode({
          clientId,
          redirectUri,
          code,
          verifier: authorization.verifier,
        });

        await ctx.runMutation(internal.oda.connect, {
          identity: authorization.identity,
          householdId: authorization.householdId,
          clientId,
          ...tokens,
        });

        return back(authorization.returnUrl, "connected");
      } catch (error) {
        console.error("oda.connect_failed", errorDetails(error));

        return back(authorization.returnUrl, "failed");
      }
    }),
  });
}
