# Product simplification assessment

Date: 23 September 2026. Baseline: `a59afc53b6c2635468add95f37a35e127ed5d62d`.
Status: IMPLEMENTED. Andreas approved items 1–7, with the product-linking queue
retained as a secondary action. Combining Inbox and History is deferred.

The evidence below describes the assessment baseline, before implementation.

Kvitto should make it easy to capture a receipt, find a purchase, and understand
household grocery spending. The main removal opportunity is work that asks a
person to manage the application's processing or classification.

This is a source-based product assessment. The flows and controls below exist in
the source. Their effect on frustration is a hypothesis, not a measured result.
No new device session, usage analysis, or user interviews were performed.
The earlier technical simplification plans remain complete; these are separate
product decisions. Effort estimates include focused verification but are preliminary.

## 1. Stop requiring category decisions to complete receipt review

- Evidence: `src/lib/domain/receipt-review.ts:210` counts uncertain categories as
  review tasks; line 238 requires every task to be resolved for acceptance.
  Quick approval already accepts suggested categories when no other issues remain.
- Impact: A person can capture a readable receipt and still receive another task
  because the application cannot choose a category. This can make repeated use
  feel like maintaining a database.
- Recommendation: Separate essential receipt checks from optional category
  refinement. Keep uncertain categories explicitly unknown or provisional. Keep
  checks for amounts, dates, duplicates, and other material reading errors.
  Never silently turn uncertainty into a confirmed classification.
- Confidence: High for current behavior; medium for the proposed product change.
- Effort: M. Risk: Medium; approval status affects reports and notifications.
- Status: Implemented; category uncertainty remains explicit.

## 2. Move the product-linking queue to a secondary action

- Evidence: `src/app/(tabs)/inbox.tsx:195` displays a matching tip and a counted
  “Koble produkter” entry. It is explicitly optional and separate from the badge.
- Impact: The inbox can say that all receipts are processed and still offer a
  growing list of product work. The optional label does not remove that tension.
- Recommendation: Keep the queue accessible through the Inbox header. Remove its
  prominent count card and repeated tip. Keep automatic matching and correction
  on a specific receipt item.
  Keep missing product evidence explicit in reports.
- Confidence: High for the UI; medium for user impact.
- Effort: S–M. Risk: Low for hiding the entry; medium for deleting its route or
  changing matching behavior. Do not delete stored mappings or backend contracts.
- Status: Implemented with the queue retained, as requested.

## 3. Remove diagnostic tools from ordinary settings and receipt actions

- Evidence: `src/app/corrections.tsx:111` exposes “Test Jev mot rettelsene” and
  line 135 displays the model. `src/features/release-settings.tsx:64` displays
  release channel, API version, and policy revision.
  `src/features/receipt-editor.tsx:550` and line 564 expose separate product
  matching and analysis retries. `src/app/analysis.tsx:262` has a manual refresh
  even though the screen states that results update automatically.
- Impact: People must understand internal stages to decide which button might
  fix an incomplete result. The evaluation tool has no direct household task.
- Recommendation: Move model evaluation and release diagnostics to support or
  development tools. Retain correction history and undo where they help users.
  Show a specific retry only when that operation fails. Keep deliberate image
  re-reading available as an advanced action with clear consequences. Preserve
  update recovery and protection of unsaved edits.
- Confidence: High for visible controls; medium for frequency of confusion.
- Effort: S–M. Risk: Low for presentation changes; medium for retry changes.
- Status: Implemented; correction history, undo, and contextual recovery remain.

## 4. Consolidate overlapping reports and remove narrow report destinations

- Evidence: `src/features/spending-reports/reports.tsx:27` defines eight reports,
  in addition to the main breakdown and separate analysis screen.
  Line 229 adds a dedicated meat/fish report over existing categories; line 248
  adds a monthly-change report beside the analysis screen's category changes.
  `src/features/product-attributes-report.tsx:28` exposes sugar and preparation
  classifications. `src/app/analysis.tsx:161` and line 189 show both plain
  explanations and the detailed decomposition.
- Impact: Similar questions have several destinations. Product types, categories,
  brands, families, and attributes require distinctions that most people need
  only when investigating a particular purchase.
- Recommendation: Remove the separate meat/fish destination and combine the two
  change reports. Keep the new plain explanations as the primary comparison;
  place the detailed calculation behind that result. Remove sugar/preparation
  reports from the default product unless they serve an explicit user need.
  Keep the source data and honest coverage information. Avoid a replacement menu
  that simply contains every old destination.
- Confidence: High for overlap; medium for the value of narrow reports.
- Effort: M. Risk: Low–medium; preserve links to underlying receipt lines.
- Status: Implemented; source data and receipt links remain.

## 5. Remove routine success notifications

- Evidence: `convex/notifications.ts:93` permits notifications for automatically
  accepted receipts as well as receipts requiring review. Line 154 emits
  “godkjent automatisk”.
- Impact: Routine successful processing can interrupt people even when no
  decision is needed. Frequent notifications may make important failures less
  noticeable. This effect has not been measured.
- Recommendation: Keep an in-app completion state. Reserve push notifications
  for material problems and reminders the person requested. Keep the new review
  and reminder actions for notifications that remain useful.
- Confidence: High for delivery eligibility; medium for actual notification volume.
- Effort: S. Risk: Low; verify that actionable notifications remain available.
- Status: Implemented; review notifications and requested reminders remain.

## 6. Remove household naming as a required setup step

- Evidence: `src/features/session.tsx:296` gates the app on household setup.
  `src/features/sign-in.tsx:283` requires creating or joining a household before
  capture; line 301 asks for its name, with “Hjemme” already the default.
- Impact: New users make a structural decision before they get their first
  useful result. Shared ownership is useful, but naming it need not be mandatory.
- Recommendation: Offer a direct start using a default household and retain an
  equally clear invitation path. Defer naming and invitations until needed.
  Check the existing one-household membership rules before implementing this;
  automatic creation must not obstruct a later invitation or move purchases.
- Confidence: High for the setup gate; medium for its effect on adoption.
- Effort: M. Risk: Medium; membership and existing receipt ownership must be preserved.
- Status: Implemented; explicit default-household start or invitation join, with
  authenticated rename in Settings. Household ownership rules remain unchanged.

## 7. Use one default scope for spending totals

- Evidence: `src/app/(tabs)/spending.tsx:355` shows grocery purchases as the main
  total, line 554 shows the separate paid amount, and line 646 offers an
  approved-only filter. Line 112 deliberately keeps widget totals unfiltered.
- Impact: A person can see different valid totals without understanding why.
  The problem is the number of exposed scopes, not evidence of incorrect math.
- Recommendation: Keep one clearly labelled grocery total with a provisional
  amount where needed. Move payment reconciliation into details. Remove the
  approved-only switch from the main flow unless user evidence supports it.
  Retain the distinction between purchases, deposits, discounts, and amounts paid.
- Confidence: High for available scopes; medium for resulting confusion.
- Effort: M. Risk: Medium; labels and receipt contributions must stay consistent.
- Status: Implemented; payment reconciliation is a secondary report.

## 8. Test whether inbox and history need separate tabs

- Evidence: `src/app/(tabs)/_layout.tsx:29` and line 44 provide separate receipt
  inbox and history destinations. Both are ways to locate receipts by status.
- Recommendation: Test one “Kvitteringer” destination with “Trenger kontroll”
  and “Alle”, persistent search, and a visible capture action. Do not merge them
  solely to reduce the tab count; a dedicated review queue may help frequent users.
- Confidence: Low–medium without task observation.
- Effort: M. Risk: Medium; receipt discovery and review efficiency can regress.
- Status: Design experiment, not a recommended immediate deletion.

## Order and retained value

Items 1–7 are implemented together. Item 8 remains a later design experiment.

Keep reliable capture, offline upload, receipt search, shared access, correction
and undo, monthly totals, plain spending explanations, and links to source receipts.
Siri, widgets, and the share extension can reduce steps without adding required
choices inside the app. Their existence alone is not a reason for removal.

External design reference consulted:
[Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/).
The findings above are based on this repository, not on a claim that Apple requires
these product decisions.

## Implementation review and verification

Three independent sub-agents reviewed domain behavior, interface maintainability,
and installed-client compatibility. The reviews found and corrected:

- Swipe approval still remembered suggested categories. Approval now sends no
  category-memory commands; explicit category corrections remain available.
- Receipt save marked unchanged lines as manual after server normalization.
  Edit detection now runs before compatibility fields are added.
- The removed approval filter left unused presentation arguments. Those arguments
  were removed; purchase calculations keep their existing default scope.

Focused tests cover category evidence and manual flags through extraction and
actual receipt save, notification eligibility, and authenticated household rename
with stale-name and household-isolation checks. No stored data is deleted.
Existing backend endpoints remain available to installed clients.

The release targets TestFlight build 15, with the preview environment and staging
Convex deployment `courteous-jay-215`. Backend deployment precedes the OTA. Native
configuration, local queues, authentication storage, and minimum versions do not
change. Active-client evidence also includes builds 14 and 10; their runtime
updates are separate, and the backend retains their existing contracts.

`npm run check:ci` passed, including formatting, types, lint, 13 lint-rule tests,
and 323 application tests with coverage. The final domain re-review passed 85
focused tests. All three sub-agent reviews passed after the fixes.

No new physical-device interaction, offline upgrade, or OTA rollback was tested.
Source review and automated tests do not prove installation on a device.
