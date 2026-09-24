---
name: convex
description: Implement or change Kvitto backend functions, schemas, scheduled work, and integrations. Use the existing authentication, data contracts, and installed Convex version.
---

# Kvitto backend implementation

Read the repository's [generated Convex guidelines](../../../convex/_generated/ai/guidelines.md) for backend changes. Check the installed package version and relevant types before using a version-dependent API; use targeted [official documentation](https://docs.convex.dev/) when local guidance is insufficient.

Preserve the existing Better Auth integration, household membership checks, and client compatibility wrappers. Trace the relevant authorization helper and its caller; do not introduce a second auth package or infer access from a client-supplied identity.

Keep domain decisions pure. Queries return persisted state; mutations enforce authorization and revision checks with related writes in one transaction. Network operations belong in actions. Reuse the existing workflow and workpool components when their guarantees fit the task. A new component needs a concrete responsibility.

Use indexes and pagination for growing reads, and bounded batches with continuation for background work. A limit must not silently turn a partial result into a complete result. Schedule internal functions; make retries and recurring handlers idempotent. Accepted server work must finish independently of screens.

Use [architecture](../../../docs/architecture.md) for ownership changes and [principles](../../../docs/principles.md) for domain modeling. Read only the relevant sections.

Verify with the [project checks](../../../README.md#checks) and existing test setup. For backend behavior tests, use the [verification reference](../convex-reviewer/references/verification.md). A deployment is a separate operation, not an automatic code-completion check. For environment setup, read [backend setup](../../../README.md#backend-configuration). For authorized publication, use [release operations](../release-operations/SKILL.md). For changes that affect installed clients, use [release-review](../release-review/SKILL.md).

Read [implementation details](references/implementation-details.md) for registration, runtime, HTTP, storage, or API-version pitfalls. For an architecture explanation or readiness assessment, read [architecture assessment](references/architecture-assessment.md).
