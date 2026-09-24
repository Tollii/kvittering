# 001 — Complete paid-work admission coverage

Priority: P1. Execution status is in the [plan index](../README.md).
Baseline: `96331941a84ca8fcb23da55b06478afacfce3eac`.

## Outcome and evidence

A signed-in member can repeatedly invoke category evaluation, submit new catalog
keys, reserve new receipts, and retry completed receipts. There is no shared
account-hour admission rule. A public account can therefore create ongoing paid
work, including work queued for later execution.

Evidence: [convex/correctionEvaluation.ts:49](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/correctionEvaluation.ts),
[convex/receipts.ts:100](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/receipts.ts),
[convex/receipts.ts:194](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/receipts.ts),
[convex/catalogQueue.ts:66](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/catalogQueue.ts), and
[convex/catalogMatching.ts:185](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/catalogMatching.ts).
The [call analysis](paid-calls.md) gives per-request amplification.
Unverified email sign-up at [convex/auth.ts:100](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/auth.ts) makes
account creation a weak cost boundary on its own.

## Current implementation and remaining scope

The [active-work comparison](concurrent-work.md) confirms transactional receipt
quotas per user/household, provider allowances charged before each network
attempt, an email-sign-up flag, and an extraction output limit. Reuse
`rateLimits.ts` and `providerTransport.ts` from that task. This resolves the
baseline absence of receipt and deployment-wide provider caps; do not implement
a second limiter. The original evidence above remains the audit record.

1. Decide per-account or household admission for direct category evaluation and
   new catalog searches. One account can currently consume the shared provider
   allowance and make those services unavailable to every household. Cached
   reads and idempotent resumes should not consume new-work allowance.
2. Verify every outbound path, including SDK retries and operator evaluations,
   uses the existing provider transport. Preserve the conservative treatment of
   uncertain network outcomes; do not refund a request that may have been sent.
3. Bound work size as well as request count, including TypeSafe question count
   and receipt input bytes. Implement the five-image requirement through 009.
   Keep the explicit distinction between request caps and monetary budgets.
4. Preserve installed-client rejection behavior and queued-image recovery.
   Adopt the other task's retry deadlines and receipt quota rollback rules.

Dependencies: the other task's rate-limit implementation. Coordinate with 002,
008, and 009. Decide any new allowance values from expected usage; this review
does not silently impose extra quotas on normal users.

## Verification and completion

Retain the other task's quota and transport tests. Extend evaluation and catalog
tests for the remaining account-admission rule. With a
controlled clock, submit concurrent requests up to and beyond each allowance;
assert exact admitted jobs and provider effects. Repeat across two household
members, fresh accounts, idempotency keys, cache hits, restarts, and retry paths.
Advance one hour and verify the intended recovery. A denied request must leave
its receipt and queue recoverable and make zero provider calls.

Make the check fail by bypassing one admission guard. A local provider stub must
count nested retries and the number of questions, not merely action invocations.
Run the relevant tests and the verification guide's required checks when
implementing. Complete when every paid entry point uses the shared allowance and the chosen
account-admission rules have observable denial tests. Verify that account A
cannot consume account B's reserved service allowance when such a rule is enabled. Measure contention in an isolated deployment
before release. Roll back thresholds without deleting queued work.
