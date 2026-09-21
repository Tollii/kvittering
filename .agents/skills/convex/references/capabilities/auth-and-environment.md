# Authentication, environment, and fixture operations

Read for auth configuration, deployment secrets, or data setup. Kvitto already uses Better Auth; the removed auth skill's `@convex-dev/auth` package, provider, and key recipe are not a migration instruction.

## Authentication integration

Trace the configured provider, server identity mapping, app provider, route protection, and redirects as one flow. Check the backend auth configuration when a client appears signed in but server identity is null. Verify a real sign-in and a protected request; type checking alone does not establish a working round trip.

For an explicitly selected alternative provider, use its version-matched setup instructions. Prefer a documented noninteractive setup in automation, and keep generated private keys out of command output and source control. Use protected temporary files when required and remove them after securely installing the secrets. Use a structured environment tool or the CLI's documented value form to avoid treating a leading dash in a key as an option. Do not retain keys in an unprotected JSON file or rely on a guessed auth wizard.

Client integration must match the platform. Do not install web UI primitives into the native application to reproduce a generic sign-in example. Domain changes can require callback/origin updates; test the full flow afterward.

## Environment values

Use the selected deployment's environment. Do not copy secrets to client-public variables or print values when checking that they were set. Determine which runtime can access a value from installed documentation; the old blanket claim that environment access is action-only is not an application contract. Check the specific configured runtime and component boundary.

## Fixtures and imports

Use an internal fixture function or a schema-matched import in an isolated target. Make repeated setup idempotent with stable identifiers or narrowly scoped replacement. Do not interpret idempotence as permission to clear unrelated data. Seed useful positive and negative cases; verify relationships and behavior as well as counts. Keep private production data out of shared fixture deployments.
