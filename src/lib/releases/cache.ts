import Storage from "expo-sqlite/kv-store";
import { storageSuffix } from "../deployment-storage";
import { installedRelease } from "./client";
import { parsePolicy, type ReleasePolicy } from "./policy";

const prefix = `release-policy-v1${storageSuffix}:${installedRelease.channel}:${installedRelease.platform}`;
export function readCachedPolicy():
  { policy: ReleasePolicy; fetchedAt: number } | undefined {
  try {
    const raw = JSON.parse(Storage.getItemSync(prefix) ?? "null");
    if (!raw || !Number.isFinite(raw.fetchedAt) || raw.fetchedAt < 0) return;
    const policy = parsePolicy(raw.policy);
    if (
      policy.channel !== installedRelease.channel ||
      policy.platform !== installedRelease.platform
    )
      return;
    return { policy, fetchedAt: Math.min(raw.fetchedAt, Date.now()) };
  } catch {
    return;
  }
}
export function cachePolicy(policy: ReleasePolicy, fetchedAt: number) {
  try {
    Storage.setItemSync(prefix, JSON.stringify({ policy, fetchedAt }));
  } catch {
    /* Memory remains available when storage is full. */
  }
}
export function dismissedUntil(release: string): number {
  try {
    return Number(Storage.getItemSync(`${prefix}:reminder:${release}`)) || 0;
  } catch {
    return 0;
  }
}
export function dismissUpdate(release: string, until: number) {
  try {
    Storage.setItemSync(`${prefix}:reminder:${release}`, String(until));
  } catch {
    /* Dismissal still applies for this session. */
  }
}
