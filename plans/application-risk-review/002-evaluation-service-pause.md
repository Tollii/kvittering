# 002 — Apply service pauses to category evaluation

Priority: P1. Execution status is in the [plan index](../README.md).
Baseline: `96331941a84ca8fcb23da55b06478afacfce3eac`.

## Comparison with active work

See [the working-copy comparison](concurrent-work.md).

The newer task wraps evaluation HTTP calls with the TypeSafe quota transport,
but still omits a feature from `releasePolicy.check`. The service-pause defect
remains. Reuse its transport when implementing the guard.

## Outcome and evidence

An operator disables receipt processing, product lookup, automatic matching, and
spending analysis. A member with one category correction then invokes
`correctionEvaluation:evaluate`. The action still sends a new TypeSafe request.
An operator cannot stop this paid path with the existing service controls.

[convex/correctionEvaluation.ts:50](https://github.com/Tollii/kvittering/blob/96331941a84ca8fcb23da55b06478afacfce3eac/convex/correctionEvaluation.ts) checks
release compatibility without a feature. Line 82 sends the paid request.
The membership check at line 53 correctly protects the data, but does not gate
the service. [The reproduction](reproductions.md) observed one mocked HTTP call
with all four services disabled on both platforms.

## Scope and approach

Assign evaluation to the appropriate existing service, or explicitly define a
separate service if it has a distinct product requirement. Check it on the
server before provider work. Update the client to display the same paused
behavior. Preserve authorization and the optional client metadata accepted by
installed clients. New work must be blocked; cancellation of already executing
provider requests is a separate policy.

Dependencies: none. Coordinate the admission check with plan 001; the pause fix
can be implemented independently.

## Verification and completion

Promote the evaluation reproduction to a focused backend test. Seed an actual
category correction, disable the controlling service, call the public action,
and assert a compatible failure and zero HTTP requests. Cover absent legacy
client metadata, supported metadata, and an authenticated user from another
household. Restore the service and verify an allowed call.

Removing the feature guard must make the zero-call assertion fail. Complete
when both UI and direct API callers observe the pause. No migration or raised
minimum client version is required.
