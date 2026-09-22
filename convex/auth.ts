import {
  createClient,
  type AuthFunctions,
  type GenericCtx,
} from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth/minimal";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import appConfig from "../app.json";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import { env, query } from "./_generated/server";

const authFunctions: AuthFunctions = internal.auth;

export const authComponent = createClient<DataModel>(components.betterAuth, {
  authFunctions,
  triggers: {
    account: {
      onCreate: async (ctx, account) => {
        if (account.providerId !== "apple") return;

        // The component invokes this within the account creation transaction.
        const accounts = await ctx.runQuery(
          components.betterAuth.adapter.findMany,
          {
            model: "account",
            where: [
              { field: "accountId", value: account.accountId },
              { field: "providerId", value: "apple" },
            ],
            paginationOpts: { cursor: null, numItems: 2 },
          },
        );

        if (accounts.page.length > 1)
          throw new Error(
            "Apple-kontoen er allerede koblet til en annen konto.",
          );
      },
    },
  },
});

export const { onCreate } = authComponent.triggersApi();

export const appleConnected = query({
  args: {},
  returns: v.union(v.boolean(), v.null()),
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);

    // The subscription can update before the client finishes signing out.
    if (!user) return null;

    const account = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "account",
      where: [
        { field: "userId", value: user._id },
        { field: "providerId", value: "apple" },
      ],
    });

    return account !== null;
  },
});

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: env.CONVEX_SITE_URL,
    secret: env.BETTER_AUTH_SECRET,
    // Apply the same origin protection in tests and deployed environments.
    advanced: { disableOriginCheck: false },
    database: authComponent.adapter(ctx),
    socialProviders: {
      apple: {
        // Native identity-token verification needs no Apple client secret.
        clientId: appConfig.expo.ios.bundleIdentifier,
        appBundleIdentifier: appConfig.expo.ios.bundleIdentifier,
        mapProfileToUser: (profile) => ({ name: profile.name || "Medlem" }),
      },
    },
    account: {
      accountLinking: {
        disableImplicitLinking: true,
        // Explicit linking proves both identities, including private relay email.
        allowDifferentEmails: true,
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 12,
    },
    trustedOrigins: [
      "kvitto://",
      ...(env.SITE_URL ? [env.SITE_URL] : []),
      // Expo Go uses exp:// even when the app has a custom scheme.
      ...(env.ALLOW_EXPO_GO === "true" ? ["exp://"] : []),
    ],
    plugins: [expo(), convex({ authConfig })],
  });
