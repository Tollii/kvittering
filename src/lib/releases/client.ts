import { z } from "zod";
import * as Application from "expo-application";
import * as Updates from "expo-updates";
import * as Sentry from "@sentry/react-native";
import { Platform } from "react-native";
import { recordEvent, reportError } from "../observability";
import { parseUserError } from "../user-errors";
import type { DiagnosticFields } from "../diagnostics";
import {
  apiVersion,
  type ClientRelease,
  type ReleasePolicy,
  parsePolicy,
} from "./policy";

const channel = Updates.channel ?? process.env.EXPO_PUBLIC_RELEASE_CHANNEL;

export const installedRelease: ClientRelease = {
  version: Application.nativeApplicationVersion ?? "0.0.0",
  build: Application.nativeBuildVersion ?? "0",
  platform: Platform.OS === "android" ? "android" : "ios",
  channel:
    channel === "testflight" || channel === "production"
      ? channel
      : "development",
  apiVersion,
  updateId: Updates.updateId,
  runtimeVersion: Updates.runtimeVersion,
};

const listeners = new Set<(policy: ReleasePolicy) => void>();

export function subscribeServerPolicy(
  listener: (policy: ReleasePolicy) => void,
) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

const releaseFailureSchema = z.object({
  data: z.object({
    code: z.enum([
      "UNSUPPORTED_API_VERSION",
      "UPDATE_REQUIRED",
      "SERVICE_PAUSED",
    ]),
    policy: z.unknown().optional(),
  }),
});

/** Convert backend policy and user errors into UI policy updates and plain user messages. */
export function releaseError(
  cause: unknown,
  operation = "backend.request",
  fields: DiagnosticFields = {},
): Error {
  const data = releaseFailureSchema.safeParse(cause).data?.data;

  if (data?.code === "UNSUPPORTED_API_VERSION") {
    reportError(cause, operation, fields);

    return new Error(
      "Denne appversjonen støttes ikke av tjenesten ennå. Prøv igjen senere.",
    );
  }

  // The remaining codes block requests and carry the policy that explains why.
  if (data && "policy" in data) {
    recordEvent("release.request_blocked", {
      ...fields,
      operation,
      code: data.code,
    });

    try {
      const policy = parsePolicy(data.policy);

      for (const listener of listeners) listener(policy);
    } catch {
      /* A future policy format must not discard the last valid policy. */
    }

    return new Error(
      data.code === "UPDATE_REQUIRED"
        ? "Oppdater Kvitto for å fortsette."
        : "Funksjonen er midlertidig satt på pause. Prøv igjen senere.",
    );
  }

  reportError(cause, operation, fields);

  return (
    parseUserError(cause) ??
    (cause instanceof Error ? cause : new Error("Handlingen mislyktes."))
  );
}

export function setReleaseDiagnostics(policyRevision: number) {
  Sentry.setAttributes({
    release_channel: installedRelease.channel,
    native_version: installedRelease.version,
    native_build: installedRelease.build,
    api_version: installedRelease.apiVersion,
    ota_update_id: installedRelease.updateId ?? "embedded",
    policy_revision: policyRevision,
  });
  Sentry.setContext("clientRelease", releaseDiagnostics(policyRevision));
  Sentry.setTag("release_channel", installedRelease.channel);
  Sentry.setTag("api_version", installedRelease.apiVersion);
  Sentry.setTag("native_build", installedRelease.build);
  Sentry.setTag("ota_update_id", installedRelease.updateId ?? "embedded");
}

export function releaseDiagnostics(policyRevision: number) {
  return {
    ...installedRelease,
    policyRevision,
    backend: process.env.EXPO_PUBLIC_CONVEX_URL,
  };
}
