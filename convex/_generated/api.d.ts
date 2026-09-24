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
import type * as catalog from "../catalog.js";
import type * as catalogClassifier from "../catalogClassifier.js";
import type * as catalogLinks from "../catalogLinks.js";
import type * as catalogMatching from "../catalogMatching.js";
import type * as catalogMatchingEvaluation from "../catalogMatchingEvaluation.js";
import type * as catalogQueue from "../catalogQueue.js";
import type * as catalogWorker from "../catalogWorker.js";
import type * as clientFunctions from "../clientFunctions.js";
import type * as clientReleases from "../clientReleases.js";
import type * as correctionEvaluation from "../correctionEvaluation.js";
import type * as corrections from "../corrections.js";
import type * as crons from "../crons.js";
import type * as deployment from "../deployment.js";
import type * as digest from "../digest.js";
import type * as featureFlags from "../featureFlags.js";
import type * as households from "../households.js";
import type * as http from "../http.js";
import type * as kassalapp_generated_client from "../kassalapp/generated/client.js";
import type * as kassalapp_generated_models_allergenItemResource from "../kassalapp/generated/models/allergenItemResource.js";
import type * as kassalapp_generated_models_authenticationExceptionResponse from "../kassalapp/generated/models/authenticationExceptionResponse.js";
import type * as kassalapp_generated_models_bulkPriceHistory200 from "../kassalapp/generated/models/bulkPriceHistory200.js";
import type * as kassalapp_generated_models_bulkPriceHistory200Meta from "../kassalapp/generated/models/bulkPriceHistory200Meta.js";
import type * as kassalapp_generated_models_bulkPriceHistoryBody from "../kassalapp/generated/models/bulkPriceHistoryBody.js";
import type * as kassalapp_generated_models_bulkPriceHistoryBodyAggregation from "../kassalapp/generated/models/bulkPriceHistoryBodyAggregation.js";
import type * as kassalapp_generated_models_bulkPriceHistoryItemResource from "../kassalapp/generated/models/bulkPriceHistoryItemResource.js";
import type * as kassalapp_generated_models_bulkPriceHistoryPriceResource from "../kassalapp/generated/models/bulkPriceHistoryPriceResource.js";
import type * as kassalapp_generated_models_bulkPriceHistoryStoreResource from "../kassalapp/generated/models/bulkPriceHistoryStoreResource.js";
import type * as kassalapp_generated_models_findPhysicalStoreById200 from "../kassalapp/generated/models/findPhysicalStoreById200.js";
import type * as kassalapp_generated_models_findProductByEanBarcode200 from "../kassalapp/generated/models/findProductByEanBarcode200.js";
import type * as kassalapp_generated_models_findProductById200 from "../kassalapp/generated/models/findProductById200.js";
import type * as kassalapp_generated_models_findProductByUrl200 from "../kassalapp/generated/models/findProductByUrl200.js";
import type * as kassalapp_generated_models_findProductByUrl404 from "../kassalapp/generated/models/findProductByUrl404.js";
import type * as kassalapp_generated_models_findProductByUrlParams from "../kassalapp/generated/models/findProductByUrlParams.js";
import type * as kassalapp_generated_models_findProductsByUrl200 from "../kassalapp/generated/models/findProductsByUrl200.js";
import type * as kassalapp_generated_models_findProductsByUrlParams from "../kassalapp/generated/models/findProductsByUrlParams.js";
import type * as kassalapp_generated_models_index from "../kassalapp/generated/models/index.js";
import type * as kassalapp_generated_models_labelItemResource from "../kassalapp/generated/models/labelItemResource.js";
import type * as kassalapp_generated_models_labelItemResourceIcon from "../kassalapp/generated/models/labelItemResourceIcon.js";
import type * as kassalapp_generated_models_modelNotFoundExceptionResponse from "../kassalapp/generated/models/modelNotFoundExceptionResponse.js";
import type * as kassalapp_generated_models_nutritionItemResource from "../kassalapp/generated/models/nutritionItemResource.js";
import type * as kassalapp_generated_models_physicalStoreResource from "../kassalapp/generated/models/physicalStoreResource.js";
import type * as kassalapp_generated_models_physicalStoreResourceOpeningHours from "../kassalapp/generated/models/physicalStoreResourceOpeningHours.js";
import type * as kassalapp_generated_models_physicalStoreResourcePosition from "../kassalapp/generated/models/physicalStoreResourcePosition.js";
import type * as kassalapp_generated_models_productComparisonItemResource from "../kassalapp/generated/models/productComparisonItemResource.js";
import type * as kassalapp_generated_models_productComparisonItemResourceCategoryItem from "../kassalapp/generated/models/productComparisonItemResourceCategoryItem.js";
import type * as kassalapp_generated_models_productComparisonItemResourceCurrentPriceItem from "../kassalapp/generated/models/productComparisonItemResourceCurrentPriceItem.js";
import type * as kassalapp_generated_models_productComparisonItemResourceKassalapp from "../kassalapp/generated/models/productComparisonItemResourceKassalapp.js";
import type * as kassalapp_generated_models_productComparisonItemResourcePriceHistoryItem from "../kassalapp/generated/models/productComparisonItemResourcePriceHistoryItem.js";
import type * as kassalapp_generated_models_productComparisonItemResourceStoreItem from "../kassalapp/generated/models/productComparisonItemResourceStoreItem.js";
import type * as kassalapp_generated_models_productComparisonResource from "../kassalapp/generated/models/productComparisonResource.js";
import type * as kassalapp_generated_models_productResource from "../kassalapp/generated/models/productResource.js";
import type * as kassalapp_generated_models_productResourceCategoryItem from "../kassalapp/generated/models/productResourceCategoryItem.js";
import type * as kassalapp_generated_models_productResourcePriceHistoryItem from "../kassalapp/generated/models/productResourcePriceHistoryItem.js";
import type * as kassalapp_generated_models_productResourceStoreItem from "../kassalapp/generated/models/productResourceStoreItem.js";
import type * as kassalapp_generated_models_searchPhysicalStores200 from "../kassalapp/generated/models/searchPhysicalStores200.js";
import type * as kassalapp_generated_models_searchPhysicalStores200Links from "../kassalapp/generated/models/searchPhysicalStores200Links.js";
import type * as kassalapp_generated_models_searchPhysicalStores200Meta from "../kassalapp/generated/models/searchPhysicalStores200Meta.js";
import type * as kassalapp_generated_models_searchPhysicalStores200MetaLinksItem from "../kassalapp/generated/models/searchPhysicalStores200MetaLinksItem.js";
import type * as kassalapp_generated_models_searchPhysicalStoresGroup from "../kassalapp/generated/models/searchPhysicalStoresGroup.js";
import type * as kassalapp_generated_models_searchPhysicalStoresParams from "../kassalapp/generated/models/searchPhysicalStoresParams.js";
import type * as kassalapp_generated_models_searchProducts200 from "../kassalapp/generated/models/searchProducts200.js";
import type * as kassalapp_generated_models_searchProducts200Links from "../kassalapp/generated/models/searchProducts200Links.js";
import type * as kassalapp_generated_models_searchProducts200Meta from "../kassalapp/generated/models/searchProducts200Meta.js";
import type * as kassalapp_generated_models_searchProductsParams from "../kassalapp/generated/models/searchProductsParams.js";
import type * as kassalapp_generated_models_searchProductsSort from "../kassalapp/generated/models/searchProductsSort.js";
import type * as kassalapp_generated_models_units from "../kassalapp/generated/models/units.js";
import type * as kassalapp_generated_models_validationExceptionResponse from "../kassalapp/generated/models/validationExceptionResponse.js";
import type * as kassalapp_generated_models_validationExceptionResponseErrors from "../kassalapp/generated/models/validationExceptionResponseErrors.js";
import type * as kassalapp_normalize from "../kassalapp/normalize.js";
import type * as kassalapp_transport from "../kassalapp/transport.js";
import type * as liveActivities from "../liveActivities.js";
import type * as liveActivityPush from "../liveActivityPush.js";
import type * as notifications from "../notifications.js";
import type * as processing from "../processing.js";
import type * as productAnalysis from "../productAnalysis.js";
import type * as productAnalysisEvaluation from "../productAnalysisEvaluation.js";
import type * as productAnalysisWorker from "../productAnalysisWorker.js";
import type * as productLinking from "../productLinking.js";
import type * as productMatching from "../productMatching.js";
import type * as products from "../products.js";
import type * as providerTransport from "../providerTransport.js";
import type * as providers from "../providers.js";
import type * as pushDelivery from "../pushDelivery.js";
import type * as rateLimits from "../rateLimits.js";
import type * as receiptChanges from "../receiptChanges.js";
import type * as receiptPeriod from "../receiptPeriod.js";
import type * as receiptReadModel from "../receiptReadModel.js";
import type * as receiptSync from "../receiptSync.js";
import type * as receiptUploadCompletion from "../receiptUploadCompletion.js";
import type * as receipts from "../receipts.js";
import type * as releasePolicy from "../releasePolicy.js";
import type * as retention from "../retention.js";
import type * as serverFunctions from "../serverFunctions.js";
import type * as spotlight from "../spotlight.js";
import type * as userErrors from "../userErrors.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  aliases: typeof aliases;
  auth: typeof auth;
  catalog: typeof catalog;
  catalogClassifier: typeof catalogClassifier;
  catalogLinks: typeof catalogLinks;
  catalogMatching: typeof catalogMatching;
  catalogMatchingEvaluation: typeof catalogMatchingEvaluation;
  catalogQueue: typeof catalogQueue;
  catalogWorker: typeof catalogWorker;
  clientFunctions: typeof clientFunctions;
  clientReleases: typeof clientReleases;
  correctionEvaluation: typeof correctionEvaluation;
  corrections: typeof corrections;
  crons: typeof crons;
  deployment: typeof deployment;
  digest: typeof digest;
  featureFlags: typeof featureFlags;
  households: typeof households;
  http: typeof http;
  "kassalapp/generated/client": typeof kassalapp_generated_client;
  "kassalapp/generated/models/allergenItemResource": typeof kassalapp_generated_models_allergenItemResource;
  "kassalapp/generated/models/authenticationExceptionResponse": typeof kassalapp_generated_models_authenticationExceptionResponse;
  "kassalapp/generated/models/bulkPriceHistory200": typeof kassalapp_generated_models_bulkPriceHistory200;
  "kassalapp/generated/models/bulkPriceHistory200Meta": typeof kassalapp_generated_models_bulkPriceHistory200Meta;
  "kassalapp/generated/models/bulkPriceHistoryBody": typeof kassalapp_generated_models_bulkPriceHistoryBody;
  "kassalapp/generated/models/bulkPriceHistoryBodyAggregation": typeof kassalapp_generated_models_bulkPriceHistoryBodyAggregation;
  "kassalapp/generated/models/bulkPriceHistoryItemResource": typeof kassalapp_generated_models_bulkPriceHistoryItemResource;
  "kassalapp/generated/models/bulkPriceHistoryPriceResource": typeof kassalapp_generated_models_bulkPriceHistoryPriceResource;
  "kassalapp/generated/models/bulkPriceHistoryStoreResource": typeof kassalapp_generated_models_bulkPriceHistoryStoreResource;
  "kassalapp/generated/models/findPhysicalStoreById200": typeof kassalapp_generated_models_findPhysicalStoreById200;
  "kassalapp/generated/models/findProductByEanBarcode200": typeof kassalapp_generated_models_findProductByEanBarcode200;
  "kassalapp/generated/models/findProductById200": typeof kassalapp_generated_models_findProductById200;
  "kassalapp/generated/models/findProductByUrl200": typeof kassalapp_generated_models_findProductByUrl200;
  "kassalapp/generated/models/findProductByUrl404": typeof kassalapp_generated_models_findProductByUrl404;
  "kassalapp/generated/models/findProductByUrlParams": typeof kassalapp_generated_models_findProductByUrlParams;
  "kassalapp/generated/models/findProductsByUrl200": typeof kassalapp_generated_models_findProductsByUrl200;
  "kassalapp/generated/models/findProductsByUrlParams": typeof kassalapp_generated_models_findProductsByUrlParams;
  "kassalapp/generated/models/index": typeof kassalapp_generated_models_index;
  "kassalapp/generated/models/labelItemResource": typeof kassalapp_generated_models_labelItemResource;
  "kassalapp/generated/models/labelItemResourceIcon": typeof kassalapp_generated_models_labelItemResourceIcon;
  "kassalapp/generated/models/modelNotFoundExceptionResponse": typeof kassalapp_generated_models_modelNotFoundExceptionResponse;
  "kassalapp/generated/models/nutritionItemResource": typeof kassalapp_generated_models_nutritionItemResource;
  "kassalapp/generated/models/physicalStoreResource": typeof kassalapp_generated_models_physicalStoreResource;
  "kassalapp/generated/models/physicalStoreResourceOpeningHours": typeof kassalapp_generated_models_physicalStoreResourceOpeningHours;
  "kassalapp/generated/models/physicalStoreResourcePosition": typeof kassalapp_generated_models_physicalStoreResourcePosition;
  "kassalapp/generated/models/productComparisonItemResource": typeof kassalapp_generated_models_productComparisonItemResource;
  "kassalapp/generated/models/productComparisonItemResourceCategoryItem": typeof kassalapp_generated_models_productComparisonItemResourceCategoryItem;
  "kassalapp/generated/models/productComparisonItemResourceCurrentPriceItem": typeof kassalapp_generated_models_productComparisonItemResourceCurrentPriceItem;
  "kassalapp/generated/models/productComparisonItemResourceKassalapp": typeof kassalapp_generated_models_productComparisonItemResourceKassalapp;
  "kassalapp/generated/models/productComparisonItemResourcePriceHistoryItem": typeof kassalapp_generated_models_productComparisonItemResourcePriceHistoryItem;
  "kassalapp/generated/models/productComparisonItemResourceStoreItem": typeof kassalapp_generated_models_productComparisonItemResourceStoreItem;
  "kassalapp/generated/models/productComparisonResource": typeof kassalapp_generated_models_productComparisonResource;
  "kassalapp/generated/models/productResource": typeof kassalapp_generated_models_productResource;
  "kassalapp/generated/models/productResourceCategoryItem": typeof kassalapp_generated_models_productResourceCategoryItem;
  "kassalapp/generated/models/productResourcePriceHistoryItem": typeof kassalapp_generated_models_productResourcePriceHistoryItem;
  "kassalapp/generated/models/productResourceStoreItem": typeof kassalapp_generated_models_productResourceStoreItem;
  "kassalapp/generated/models/searchPhysicalStores200": typeof kassalapp_generated_models_searchPhysicalStores200;
  "kassalapp/generated/models/searchPhysicalStores200Links": typeof kassalapp_generated_models_searchPhysicalStores200Links;
  "kassalapp/generated/models/searchPhysicalStores200Meta": typeof kassalapp_generated_models_searchPhysicalStores200Meta;
  "kassalapp/generated/models/searchPhysicalStores200MetaLinksItem": typeof kassalapp_generated_models_searchPhysicalStores200MetaLinksItem;
  "kassalapp/generated/models/searchPhysicalStoresGroup": typeof kassalapp_generated_models_searchPhysicalStoresGroup;
  "kassalapp/generated/models/searchPhysicalStoresParams": typeof kassalapp_generated_models_searchPhysicalStoresParams;
  "kassalapp/generated/models/searchProducts200": typeof kassalapp_generated_models_searchProducts200;
  "kassalapp/generated/models/searchProducts200Links": typeof kassalapp_generated_models_searchProducts200Links;
  "kassalapp/generated/models/searchProducts200Meta": typeof kassalapp_generated_models_searchProducts200Meta;
  "kassalapp/generated/models/searchProductsParams": typeof kassalapp_generated_models_searchProductsParams;
  "kassalapp/generated/models/searchProductsSort": typeof kassalapp_generated_models_searchProductsSort;
  "kassalapp/generated/models/units": typeof kassalapp_generated_models_units;
  "kassalapp/generated/models/validationExceptionResponse": typeof kassalapp_generated_models_validationExceptionResponse;
  "kassalapp/generated/models/validationExceptionResponseErrors": typeof kassalapp_generated_models_validationExceptionResponseErrors;
  "kassalapp/normalize": typeof kassalapp_normalize;
  "kassalapp/transport": typeof kassalapp_transport;
  liveActivities: typeof liveActivities;
  liveActivityPush: typeof liveActivityPush;
  notifications: typeof notifications;
  processing: typeof processing;
  productAnalysis: typeof productAnalysis;
  productAnalysisEvaluation: typeof productAnalysisEvaluation;
  productAnalysisWorker: typeof productAnalysisWorker;
  productLinking: typeof productLinking;
  productMatching: typeof productMatching;
  products: typeof products;
  providerTransport: typeof providerTransport;
  providers: typeof providers;
  pushDelivery: typeof pushDelivery;
  rateLimits: typeof rateLimits;
  receiptChanges: typeof receiptChanges;
  receiptPeriod: typeof receiptPeriod;
  receiptReadModel: typeof receiptReadModel;
  receiptSync: typeof receiptSync;
  receiptUploadCompletion: typeof receiptUploadCompletion;
  receipts: typeof receipts;
  releasePolicy: typeof releasePolicy;
  retention: typeof retention;
  serverFunctions: typeof serverFunctions;
  spotlight: typeof spotlight;
  userErrors: typeof userErrors;
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
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
  workflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"workflow">;
  productAnalysisWorkflow: import("@convex-dev/workflow/_generated/component.js").ComponentApi<"productAnalysisWorkflow">;
  catalogWorkpool: import("@convex-dev/workpool/_generated/component.js").ComponentApi<"catalogWorkpool">;
};
