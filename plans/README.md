# Open work

Keep only unresolved findings and active plans here. Current contracts belong in [architecture](../docs/architecture.md), procedures in their guide, and completed change evidence in Git or the pull request. The technical simplification plans 001–019 and product changes 1–7 are complete; their historical reports are available in Git history.

## Discount allocation across several products

Status: NEEDS INVESTIGATION. The 18 September 2026 review observed a Coca-Cola offer spread across unrelated products after it was classified as a receipt discount. Current `spendingLines` in `src/lib/domain/receipt.ts` still allocates receipt discounts across all products and links an item discount through one `relatedLineId`. This establishes a representation limit, not a measured current extraction failure rate.

Use a representative receipt to check extraction and correction of an offer covering several lines. If the defect is confirmed, model allocation to all eligible lines while preserving integer øre totals, unallocated discounts, and installed-client contracts. Do not change genuine receipt-wide discount allocation merely to fix a misclassified offer.

## Receipt summary before editing

Status: DEFERRED DESIGN REVIEW. The earlier native review proposed opening an approved receipt as a summary with an explicit Edit action. The current receipt route still uses the shared editor. Observe the current flow before deciding whether a separate mode reduces work; preserve unsaved edits, original-image access, and revision checks. Earlier control counts and screenshots describe an older interface.

## Inbox and History navigation

Status: DEFERRED DESIGN EXPERIMENT. The 23 September product review retained separate Inbox and History tabs. Test a combined receipt destination only if it improves both review and purchase lookup. Do not merge tabs solely to reduce their number. The optional product-linking queue remains in the Inbox header.

## Public App Store account lifecycle

Status: REQUIRED BEFORE PUBLIC RELEASE. The existing Apple sign-in integration does not implement in-app account deletion or Apple token revocation. Plan the authorization-code exchange and server credentials with that work; an identity token alone cannot revoke Apple access. Verify the current platform requirements and existing implementation before selecting the change. TestFlight configuration also needs a separate public production environment before public distribution.

## Application risk review release checks

The recent [implementation record](application-risk-review/implementation.md) and its linked plans remain available while hosted recovery, load, and signed-device checks are pending. All nine code plans are implemented. The five-image admission change requires the recovery client before backend enforcement; follow [release operations](../.agents/skills/release-operations/SKILL.md#five-image-admission-transition). The historical correction cleanup remains an explicit operator step. No deployment or release is part of this documentation cleanup.
