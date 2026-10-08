import type { HttpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { errorDetails } from "../src/lib/diagnostics";
import { odaCallbackUrl, signInExpiredMessage } from "./oda";
import {
  exchangeOdaCode,
  odaAuthorizationUrl,
  pkceChallenge,
  registerOdaClient,
} from "./odaApi";
import { randomToken } from "./tokens";

const noStore = { "Cache-Control": "no-store" };

const page = (text: string, status = 400) =>
  new Response(text, {
    status,
    headers: { ...noStore, "Content-Type": "text/plain; charset=utf-8" },
  });

const back = (
  returnUrl: string,
  status: "connected" | "failed" | "cancelled",
  confirmation?: string,
) => {
  const url = new URL(returnUrl);

  url.searchParams.set("status", status);

  if (confirmation) url.searchParams.set("confirmation", confirmation);

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
          clientId,
          state,
          verifier,
        }))
      )
        return page(signInExpiredMessage);

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

      if (!authorization) return page(signInExpiredMessage);

      const code = params.get("code");

      if (!code || authorization.expired) {
        await ctx.runMutation(internal.oda.forgetAuthorization, {
          id: authorization.id,
        });

        return back(
          authorization.returnUrl,
          params.get("error") === "access_denied" ? "cancelled" : "failed",
        );
      }

      try {
        const tokens = await exchangeOdaCode({
          clientId: authorization.clientId,
          redirectUri: odaCallbackUrl(),
          code,
          verifier: authorization.verifier,
        });

        const confirmation = randomToken();

        await ctx.runMutation(internal.oda.holdTokens, {
          id: authorization.id,
          confirmation,
          ...tokens,
        });

        return back(authorization.returnUrl, "connected", confirmation);
      } catch (error) {
        console.error("oda.connect_failed", errorDetails(error));
        await ctx.runMutation(internal.oda.forgetAuthorization, {
          id: authorization.id,
        });

        return back(authorization.returnUrl, "failed");
      }
    }),
  });
}
