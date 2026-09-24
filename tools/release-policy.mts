import { z } from "zod";

export const stagingDeployment = "courteous-jay-215";

const recoveryRecord = z.object({
  deployment: z.literal(stagingDeployment),
  recoveryClient: z.object({
    build: z.string().regex(/^[1-9]\d*$/),
    sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
    verifiedAt: z.iso.datetime(),
    verifiedBy: z.string().trim().min(1),
    evidence: z
      .url()
      .refine((url) => new URL(url).hostname === "appstoreconnect.apple.com"),
    availableToTesters: z.literal(true),
    pendingUploadUpgradePassed: z.literal(true),
  }),
});

/** Apple availability is an operator observation, never inferred from build completion. */
export function requireRecoveryClient(
  recordJson: string,
  now = Date.now(),
): void {
  const parsed = recoveryRecord.safeParse(JSON.parse(recordJson));

  if (
    !parsed.success ||
    Date.parse(parsed.data.recoveryClient.verifiedAt) > now
  ) {
    throw new Error(
      "Five-image deployment requires a reviewed staging recovery-client record with tester availability and a pending-upload upgrade check. See .agents/skills/release-operations/SKILL.md.",
    );
  }
}

export function requireDeploymentKey(key: string | undefined): void {
  if (!key || !/^prod:courteous-jay-215\|[\w+/=-]+$/.test(key)) {
    throw new Error(
      `Expected a staging deploy key for ${stagingDeployment}. No operation was started.`,
    );
  }
}

export function requireReleaseStage(
  stage: string | undefined,
  imageLimit: number,
): void {
  if (stage === "additive" && imageLimit === 8) return;

  if (stage === "enforcement" && imageLimit === 5) return;
  throw new Error(
    "Select --stage additive with eight-image source, or --stage enforcement with five-image source. The combined five-image source cannot be the initial deployment.",
  );
}

export function requireReadModel(readyJson: string): void {
  if (JSON.parse(readyJson) !== true)
    throw new Error(
      "The staging receipt read-model backfill is not ready. Complete and verify it before releasing the client or enforcing five images.",
    );
}
