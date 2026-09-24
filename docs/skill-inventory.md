# Maintained skill inventory

Updated 22 September 2026. This is a maintenance record, not required agent context.

The cleanup keeps seven repository entry points and sixteen distinct personal entry points. Skill count, description size, selection precision and invocation frequency determine where context reduction is useful. File length alone is not a reason to shorten or split a skill.

## Context priorities

1. Keep descriptions concise and specific because they participate in skill selection. Avoid long trigger lists and descriptions that attract unrelated work.
2. Consolidate skills whose responsibilities and invocation conditions substantially overlap. Keep distinct specialist skills when their task justifies them; a smaller count is not an end in itself.
3. Review frequently invoked skills for repeated or irrelevant instructions. Broad implementation and discovery skills are candidates for this review, but actual invocation frequency must be measured rather than inferred from file size.
4. Let task-specific skills contain the detail needed to perform their task. UI polish, strict code review and release checks can have long bodies. The task needs that guidance once the skill is selected.
5. Use references for genuinely separate modes, optional examples, platform variants or large lookup material. Do not split a coherent procedure merely to make `SKILL.md` shorter. Moving instructions that every invocation needs into another file does not remove their context cost and adds a retrieval step.

The strict review rubric, UI polish criteria, backup and migration procedures, authorization scenarios, judgment design, type-design diagnostics and decision-planning procedures now reside in their respective skill bodies. Release review already keeps its full core checklist in its body. Separate Sentry command guides, Convex capability recipes, UI implementation examples and the F# worked example remain references because their relevance depends on the task.

## Repository skills

| Skill                                                                         | Responsibility and detailed guidance                                                                                                            |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [convex](../.agents/skills/convex/SKILL.md)                                   | Backend implementation; API and runtime pitfalls; architecture assessment; optional capability recipes and full component-authoring references. |
| [convex-backup](../.agents/skills/convex-backup/SKILL.md)                     | Exports, isolated restore, verification, retention and recovery procedures.                                                                     |
| [convex-insights](../.agents/skills/convex-insights/SKILL.md)                 | Failure events, read limits, contention, incident handling and cost analysis.                                                                   |
| [convex-migrate-rehearse](../.agents/skills/convex-migrate-rehearse/SKILL.md) | Compatible schema transitions, resumable backfills, representative rehearsal and recovery.                                                      |
| [convex-reviewer](../.agents/skills/convex-reviewer/SKILL.md)                 | Correctness, household authorization scenarios, transactions, bounded reads and behavior tests.                                                 |
| [release-review](../.agents/skills/release-review/SKILL.md)                   | Installed-client, local queue, workflow replay, policy, native and OTA compatibility.                                                           |
| [typesafe-ai](../.agents/skills/typesafe-ai/SKILL.md)                         | Judgment design, candidate coverage, uncertainty, composition, evaluation, documentation map and implementation patterns.                       |

Of the original 35 repository entry points, 27 are consolidated into these entries, references or [backend operations](backend-operations.md). The provider transcript-upload skill is archived only. Optional agent, billing, scheduling, domain and component-authoring guides remain available locally through the implementation skill.

Backend operations owns target selection, authorization scope, environment handling, fixtures and snapshot retention. Code edits and reviews do not imply deployment. Implementation and authorization guidance follows this application's Better Auth and household access model.

## Personal skills

These changes affect other repositories on this machine. Each source is listed once; host discovery links are not additional skills.

| Entry point                        | Guidance retained or restored                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| apple-design                       | Motion, materials, typography, product purpose, design foundations and process.                                           |
| codebase-memory                    | Indexed discovery, graph queries, traces, filters, freshness and coverage limits.                                         |
| file-pr                            | Concise PR workflow; unavailable follow-up dependency removed.                                                            |
| find-skills                        | Requested discovery, concrete search/install examples, source review and installation scope.                              |
| grilling                           | Focused decision rounds, dependencies, recommendations and durable records from grill-with-docs.                          |
| html-communication                 | Existing HTML artifact constraints.                                                                                       |
| improve                            | Audit categories, architecture heuristics from improve-codebase-architecture, assessment modes, plans and follow-through. |
| make-interfaces-feel-better        | All five UI references and original animation defaults.                                                                   |
| mock-roles-not-objects             | Specialist collaborator-role and interaction-testing guidance.                                                            |
| prototype                          | Experimental purpose, scope and workflow.                                                                                 |
| responsibility-driven-type-design  | Invariants, parsing, pure composition, design diagnostics and corrected F# pipeline example.                              |
| sentry-cli                         | Command references, workflow examples, dashboard layout, usage details and common mistakes.                               |
| show-me                            | Format selection and concrete diagram, tree, diff and HTML examples.                                                      |
| teach                              | Teaching methods, conversational learning from learn, course and lesson structure, assets and record templates.           |
| thermo-nuclear-code-quality-review | Strict gate, detailed standards, diagnostic questions, remedies and approval criteria.                                    |
| wayfinder                          | Decision records, dependencies, evidence, ownership and session resumption.                                               |

The personal skills are outside the repository and are not included in a Kvitto Git commit. System and plugin-managed packages were not changed.

## Ownership and discovery

Edit repository skill sources under `.agents/skills/<name>/`. Each corresponding `.claude/skills/<name>` is a relative directory link to that source, including its references. Do not replace maintained project guidance with an upstream bundle without reviewing the differences.

Personal Claude copies of `sentry-cli` and `show-me` were byte-identical to their original shared sources and now use links too. Original files and links remain in `/Users/andreas.tolnes/.codex/skill-backups/20260921-230319/skills.tar.gz`.

Keep each skill's normal workflow and decision criteria together, even when they are long. If a reference serves a separate mode or optional detail, say when to read it. Record substantive corrections and removals separately from movement and formatting. Evaluate context changes against the tasks that select the skill, not a universal body-word target.

## Verification

Validation covers all 23 retained skill entry points, local links, formatting and shared directory targets. The installed Codex server discovers all seven repository skills without errors. Claude directory links were checked for target identity and readable resources; no Claude model session was used. The corrected F# example was compiled and exercised through its successful path and three failure outcomes.

These checks establish file structure and example behavior. They are not independent evaluations of model behavior or live verification of every historical third-party command. Version-sensitive recipes require installed help, types or current official documentation when used. Application tests and deployment are not part of this documentation-only correction.
