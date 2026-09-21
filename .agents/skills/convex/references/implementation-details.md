# Implementation details and failure diagnosis

Read the relevant section when changing registrations, HTTP routes, storage, or an unfamiliar API. The generated guidelines and installed packages remain authoritative for the installed version.

## Registration and runtime

Application function constructors come from the application's generated server module; generated `api`, `internal`, and component references come from its generated API module. Use object-form registrations and the project's argument and result validators. Model fixed values with literal validators and unions. Distinguish missing optional fields from an explicit null result; JavaScript `undefined` is not a persisted Convex value.

Use table-specific identifiers where the boundary preserves their table identity. Across a component boundary, follow that component's actual identifier contract instead of assuming an app `Id` validator is valid there.

Keep Node-only imports in action-only modules with the appropriate runtime directive. Do not put queries or mutations in a Node action module. Use platform APIs where possible. Network calls belong in actions, with database changes through the transaction functions that own them.

Check reserved names before inventing table, index, or export names. `_creationTime` is maintained by Convex; follow the installed index rules rather than manually appending system columns. Index range builders use the supported comparison methods; do not invent a `.range()` method.

Use generated function references when calling `ctx.runQuery`, `ctx.runMutation`, or `ctx.runAction`, not imported handler implementations. Keep internal work internal; expose public functions only when a real caller needs them and access is enforced.

## HTTP and storage

Register HTTP handlers through the framework's HTTP-action wrapper. Convex routing is not Express routing: do not assume a `:parameter` path is interpreted dynamically. Use the supported prefix route and parse the remaining path when required.

Store durable storage identifiers rather than treating a derived download URL as the file's identity. Resolve URLs when needed and check access and missing-file behavior. Keep authorization on the endpoint that serves or modifies the resource.

## Reads and writes

An index narrows the candidate set; a later filter still examines candidates. Inspect actual scope and expected growth rather than banning every filter or adding an index for every field. Choose pagination or bounded work with continuation when completeness matters. A truncated result must not be presented as complete.

For existing documents, expand the schema compatibly, backfill with resumable work, verify, then tighten only when supported writers allow it. Read the migration skill for the complete procedure.

## Current API facts

Pin the installed Convex and component versions. Check package exports, declarations, and a version-matched README for unfamiliar names or signatures. Use an available documentation tool or targeted official page; prefer a Markdown representation when served. General search results need a version check.

When an import, argument validator, return validator, or schema push fails, identify the exact boundary and installed version before changing names or weakening types. Type-check locally first. A requested deployment can verify the deployment boundary, but does not follow automatically from every code edit. Do not force anonymous setup on a signed-in project and replace its environment selection.
