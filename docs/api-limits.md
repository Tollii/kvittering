# API usage limits

The backend uses `@convex-dev/rate-limiter`. Counters persist in the deployment
and apply to all backend instances. Limits are defined in `convex/rateLimits.ts`.
They are independent of client feature flags and cannot be bypassed by an older
app or a direct API call.

## Receipt attempts

Each user and household can accept 30 new receipt attempts per UTC day. Each
also has a token bucket with capacity 10 and a refill rate of 10 per minute.
There is no daily rollover. Midnight UTC is the daily reset, not local midnight.

A new `receipts:reserve` consumes one attempt. Repeating an existing reservation
with the same household and client ID returns that reservation without another
charge. An explicit `receipts:retry` consumes one attempt from the current caller
and the receipt household. Automatic provider retries consume provider allowance,
but do not charge the user again. Leaving a household does not reset user quota.

Authorization, validation, both quota checks, and receipt writes share one
transaction. A rejected request does not consume any quota or change the receipt.
Quota errors use Norwegian text. The upload queue retains images and the original
reservation identity after rejection. Users can retry after the quota recovers.

## New optional work

Each user and household shares these additional fixed UTC-hour and UTC-day
allowances. Crossing an hour or midnight resets only that window.

| Work                                       | Per hour | Per day |
| ------------------------------------------ | -------: | ------: |
| New interactive catalog requests           |      120 |     400 |
| Category evaluations with examples         |        6 |      12 |
| Manual receipt matching or analysis starts |       20 |      60 |

Pending requests, fresh cached results, and current analysis versions do not
consume new-work allowance. Admission and scheduling share one transaction.
A rejected batch rolls back all its starts and counters. Operator repair is
not an interactive start, but its outbound provider requests still count.
These initial limits are source-controlled operating choices, not measured
usage thresholds. Adjust them from observed usage without deleting queued work.

## Provider allowances

| Provider  | Requests per UTC day | Requests per fixed 30-day period |
| --------- | -------------------: | -------------------------------: |
| OpenAI    |                  300 |                            3,000 |
| TypeSafe  |               10,000 |                          100,000 |
| Kassalapp |               10,000 |                          100,000 |

These are separate, deployment-wide allowances. The 30-day windows start at Unix
epoch boundaries; they are not calendar months or rolling windows. No unused
allowance carries forward. Change the constants through a reviewed backend
change. A provider's own lower limit still applies, including Kassalapp's free tier.

Every outbound attempt passes through a persisted quota mutation before network
I/O. SDK retries, workflow retries, search fallbacks, product analysis, and
operator evaluations all count. Failed requests and uncertain network outcomes
are not refunded. A rejected allowance prevents the network call. If quota
storage fails, the request fails without contacting the provider.

In addition, attributed provider attempts consume both user and household limits:

| Provider  | Per UTC hour | Per UTC day |
| --------- | -----------: | ----------: |
| OpenAI    |           30 |          60 |
| TypeSafe  |          600 |       2,000 |
| Kassalapp |          600 |       2,000 |

Receipt work is attributed to its persisted uploader and household. New catalog
cache misses record their originating user and household; shared cache hits are
free. Direct evaluation uses the authenticated member. Retries use the same
source. Attribution is resolved on the server, not supplied by public callers.
One actor therefore cannot use the entire deployment allowance by issuing new
attributed work. Many actors can still exhaust a shared deployment allowance;
these limits do not reserve capacity for every account.

Operator evaluations and older journaled calls without attribution retain the
deployment limits. New public work supplies attribution. Optional internal
arguments preserve old journals; no actor data is invented for old rows.
Catalog matching uses at most 12 products and 108 questions per TypeSafe request.
The other 12-product batches and 50-example evaluation limit remain unchanged.

Receipt extraction permits at most 16,000 output tokens per request. Receipt
new uploads permit at most five images of 10 MiB each. Existing server
reservations made under the old eight-image rule can still finish with their
persisted image count. That temporary compatibility exception also applies to
the extraction provider input; client metadata cannot request it. These constraints
and request caps limit use; **they are not exact currency budgets**. Token prices,
input size, model selection, and provider billing rules still determine cost.
A monetary ceiling requires a priced reservation model or an enforceable limit
at the provider. Do not describe a billing alert as a hard spending limit.

When TypeSafe classification is unavailable, the extracted receipt is retained
with unknown categories for unresolved items. Existing exact matches and cached
catalog data remain usable. OpenAI failures leave the server receipt and images
available for an explicit retry. Catalog and analysis jobs retain their existing
bounded failure/retry behavior; all later network attempts still need allowance.

## Deployment and keys

Use a separate provider project/account where available, and a separate API key
for each of development and staging. Configure `OPENAI_API_KEY`,
`TYPESAFE_API_KEY`, and `KASSALAPP_API_KEY` only in the corresponding backend.
Separate keys improve isolation, but keys within one provider account may still
share its billing or provider-side quota. Never place them in `EXPO_PUBLIC_*`
variables or commit them. See [backend operations](backend-operations.md).

The source change does not issue or rotate provider credentials, change deployed
feature flags, or deploy the backend. Configure the isolated end-to-end deployment to use
mock receipt extraction and enable the [email registration flag](featureFlags.md#email-registration)
before creating accounts. There is no public quota bypass for tests.

For the original API safeguards, deploy the additive backend before distributing
the updated sign-in screen. The five-image tightening has the separate
client-first transition below.
Older clients keep their existing receipt API contracts and receive quota errors.
They may still show email registration, but the server rejects it when disabled.
No minimum version change or local queue migration is required. Device upgrade,
offline startup, and an actual old binary must still be checked before release.

## Five-image transition

Deploy the client with queue recovery before enforcing the new reservation
limit. A new receipt can contain one through five images. Existing server
reservations with six through eight images remain idempotent and can finish.
Their stored image count, not the caller's version, controls this exception.

An older unreserved queue is retained after the server rejects its image count.
The updated Inbox lets the person select two groups of at most five images.
This creates two receipts only after explicit selection. The transaction keeps
all original files and rolls back on a write failure. Regrouping is unavailable
while an upload attempt is active, until the server has rejected the old count,
or after reservation. Unknown future payloads remain untouched. No queue schema
version change is needed. Test this transition on installed binaries before
release; this local change does not deploy the stricter backend.
