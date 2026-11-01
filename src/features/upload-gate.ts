/** Why queued captures wait before the upload drain may start. */
export type UploadWait =
  | "offline"
  | "convex_auth"
  | "household"
  | "release"
  | "paused";

/**
 * The first unmet condition, or null when queued captures may upload. The
 * order decides which wait is named: offline comes first, so a silent wait is
 * never reported while the phone has no network.
 */
export function uploadWait(conditions: {
  online: boolean;
  authenticated: boolean;
  householdLoaded: boolean;
  releaseBlocked: boolean;
  processingEnabled: boolean;
}): UploadWait | null {
  if (!conditions.online) return "offline";

  if (!conditions.authenticated) return "convex_auth";

  if (!conditions.householdLoaded) return "household";

  if (conditions.releaseBlocked) return "release";

  if (!conditions.processingEnabled) return "paused";

  return null;
}

/**
 * Waits that leave the queue at "Laster opp" with no notice or error. The
 * session shows a notice for offline, a release block and paused processing.
 */
export const silentWaits: ReadonlySet<UploadWait> = new Set([
  "convex_auth",
  "household",
]);
