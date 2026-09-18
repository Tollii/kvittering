import { createAuthClient } from "better-auth/react";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { storageSuffix } from "./deployment-storage";

export const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
export const convexSiteUrl = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;
export const authClient = createAuthClient({
  baseURL: convexSiteUrl,
  plugins: [
    expoClient({
      scheme: "kvitto",
      storagePrefix: `kvitto${storageSuffix}`,
      storage: SecureStore,
    }),
    convexClient(),
  ],
});
export async function fetchAccessToken() {
  const result = await authClient.convex.token();
  if (!result.data?.token) throw new Error("Logg inn for å fortsette.");
  return result.data.token;
}
