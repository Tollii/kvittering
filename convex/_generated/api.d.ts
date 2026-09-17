/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as aliases from "../aliases.js";
import type * as auth from "../auth.js";
import type * as households from "../households.js";
import type * as http from "../http.js";
import type * as notifications from "../notifications.js";
import type * as processing from "../processing.js";
import type * as productMatching from "../productMatching.js";
import type * as products from "../products.js";
import type * as providers from "../providers.js";
import type * as pushDelivery from "../pushDelivery.js";
import type * as receipts from "../receipts.js";
import type * as samples from "../samples.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  aliases: typeof aliases;
  auth: typeof auth;
  households: typeof households;
  http: typeof http;
  notifications: typeof notifications;
  processing: typeof processing;
  productMatching: typeof productMatching;
  products: typeof products;
  providers: typeof providers;
  pushDelivery: typeof pushDelivery;
  receipts: typeof receipts;
  samples: typeof samples;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
};
