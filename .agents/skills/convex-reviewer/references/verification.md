# Backend verification

Use the existing Vitest and convex-test configuration and nearby examples. Select checks from the repository's quality guide. Keep fixtures small and use the app's actual authentication and household membership model.

Test observable behavior at the boundary that owns it:

- Domain calculations: inputs, results, meaningful absence, and failure outcomes.
- Access control: permitted access plus relevant unauthenticated, wrong-household, and unauthorized-parent cases. Preserve deliberately public endpoints.
- Writes: stored changes, revision conflict behavior, atomicity, and rejection without partial effects.
- Background work: duplicate delivery, stale evidence, retries, terminal failure, and completion without an open screen.
- Compatibility: legacy request shapes, persisted workflow replay, and old queued uploads where the change affects them.

Use mocks for app-owned external roles and meaningful commands. Do not mock the framework's internals merely to reproduce the implementation. Integration tests should verify adapters against their actual contracts.

## Seed, drive, and assert with convex-test

Reuse the installed `convex-test` and Vitest configuration, including the project's module-loading and runtime settings. The original setup used `edge-runtime`, `@edge-runtime/vm`, and an inline dependency setting for `convex-test`. Check the installed versions and existing configuration before adding these settings; do not replace a working configuration with a historical example.

1. Identify the function and intended contract: permitted identities, returned data, stored changes and meaningful rejection cases.
2. Create the test backend with the project's `convexTest(schema, ...)` setup. Seed through app functions where practical. Use `t.run(async (ctx) => ...)` for fixtures that public functions cannot create.
3. Seed both permitted and unrelated household data so a query can demonstrate isolation. A single household fixture cannot expose a cross-household leak.
4. Use `t.withIdentity(...)` with the real authentication subject and token shape, plus any required provider records and membership fixtures. Call the generated function reference through `t.query`, `t.mutation`, or `t.action` as appropriate. Exercise permitted, authenticated-but-unauthorized, and unauthenticated callers where access is restricted.
5. Assert the result and stored effects. For a rejected write, check that no partial change occurred. For a scoped query, assert that unrelated rows are absent. Do not weaken an intended access rule just to make a failing assertion pass.
6. For scheduled work, use the installed test framework's scheduling controls, including `t.finishInProgressScheduledFunctions` where appropriate. Control timers and external I/O so the test does not depend on wall-clock timing or a live service.
7. Run the relevant tests and report the behavior established, the failing call if any, and remaining integration gaps. This in-memory procedure does not need a deployment.

For a bug fix, reproduce the failure and verify its correction when a focused test provides useful evidence. Do not add tests that only confirm a deletion or match source text. Report exactly which checks ran and which device, deployment, or provider behavior remains unverified. Local tests do not prove a production release works.
