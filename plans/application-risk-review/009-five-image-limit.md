# 009 — Limit new receipts to five images

Priority: P2. User-approved requirement added during this review. Execution
status is in the [plan index](../README.md).
Baseline: `96331941a84ca8fcb23da55b06478afacfce3eac`.

## Comparison with active work

See [the working-copy comparison](concurrent-work.md).

The other task still permits eight images in both capture/import and server
reservation. The five-image requirement is not implemented there. Coordinate
legacy queue recovery with its new persistent retry deadlines and local cache.

## Outcome and evidence

The required limit is five images per new receipt. The current application
accepts eight: [src/lib/receipt-import.ts:6](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/src/lib/receipt-import.ts) and
[convex/receipts.ts:119](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/receipts.ts). The [requirement test](reproductions.md)
reserves a six-image receipt successfully, where rejection is required.

Each `POST /receipt-image` request already carries one image, with a 10 MiB
per-image body limit at [convex/http.ts:81](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/http.ts).
[convex/providers.ts:49](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/providers.ts) reads all images and sends
them in one OpenAI request at line 71. Thus the meaningful new count limit is
per receipt/provider input, not five multipart files in the upload HTTP route.
Eight accepted images can mean 80 MiB of stored input before base64 expansion.

## Scope and approach

Use one application policy for new captures, image selection, file/PDF import,
local queue admission, and server reservation. Accept one through five; reject
six or more before copying files or starting paid work. Enforce the rule on the
server so a direct caller cannot bypass the UI. Keep the existing per-image byte
limit and consider a total byte budget separately under plan 001.

Preserve installed-client queues. Before deploying the stricter server rule,
define recovery for existing six-to-eight-image entries, including entries not
yet reserved on the server. Do not truncate a PDF, silently drop images, or
automatically split one receipt into several purchases. An updated client must
retain all source images and let the person regroup them deliberately. Existing
server reservations must remain recoverable and idempotent; any temporary
legacy completion exception must use persisted server state, not a client-
supplied version that bypasses the new limit. Document the transition and its
effect on the five-image provider limit before release.

Dependencies: none for the new policy; release compatibility and local recovery
must be resolved before backend enforcement. Do not raise minimum versions
automatically.

## Verification and completion

Test server reservation with 0, 1, 5, 6, fractional, and excessive counts.
Verify five images reach extraction and a sixth cannot be attached outside the
reserved range. Add capture/import component tests for a sixth camera image,
multi-selection, and a six-page PDF. Rejected input must leave existing selected
images intact. Include partial uploads, repeated reservation, native background
uploads, and six-to-eight-image queues created by builds 5 and 15.

Changing the new limit back to eight must fail the six-image rejection test.
Complete when all new admission paths enforce five and legacy data remains
recoverable. Record device and release verification before deploying the server
limit. This plan does not authorize discarding existing images.
