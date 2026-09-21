---
name: typesafe-ai
description: Design or change TypeSafe judgments and SDK integrations. Use for typed semantic decisions, candidate selection, uncertainty handling, and evaluation in the existing application.
license: MIT
---

# TypeSafe integration

Read the [documentation index](https://docs.typesafe.ai/llms.txt), then only the relevant API/SDK and primitive pages. Check the installed SDK version and types. For architecture exploration, use [design patterns](references/patterns.md) and the relevant current cookbook. If live documentation is unavailable, state the limitation and avoid inventing API details.

Keep exact calculations, known rules, lookups, and execution in code. Use model judgments where semantic interpretation is needed. Preserve the user's stack and requested scope.

Choose the primitive by meaning: Choice selects among alternatives; Noul estimates whether a condition holds; Score places an answer on defined ordered levels. Read the current primitive contract before implementing it. Define state, instructions, and criteria explicitly. Question IDs are identifiers, not a substitute for a complete question.

Give each independently useful judgment one coherent question. Include enough evidence and candidate coverage; a selector cannot return an omitted candidate. Represent no-match and missing evidence when meaningful. Keep observed facts distinct from inferred state.

Batch independent questions over shared state. They cannot use one another's answers. Use another request when a prior result determines new evidence or options. State speculative premises explicitly and ignore uncertainty on unused branches.

Evaluate thresholds against representative application data and consequences. Choice/Score confidence describes distribution concentration, not authority or workflow correctness. A Noul near 0.5 indicates uncertainty, not medium intensity. Typed output guarantees shape, not truth. Test missing evidence, model errors, composition errors, and provider failures separately.

Keep raw judgments reusable when only weights or presentation change. Do not use a weighted average where one serious violation must independently block an action. Keep credentials server-side. Verify application behavior, latency, and request cost rather than copying cookbook thresholds.

For SDK migration or documentation lookup, read [the documentation map](references/documentation-map.md).

## Judgment design and evaluation

Use these criteria when choosing primitives, writing questions, or diagnosing judgment quality. Confirm SDK details against current documentation.

### Design the judgments

Choose by what the answer means, then read the relevant primitive page:

| Need                               | Primitive                                               | Important distinction                                                                              |
| ---------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| One of a defined set               | [Choice](https://docs.typesafe.ai/primitives/choice.md) | Picks one option; its distribution compares competing options                                      |
| Whether a condition holds          | [Noul](https://docs.typesafe.ai/primitives/noul.md)     | Probability of yes; no separate confidence; use one per label when several may apply               |
| Degree along a described dimension | [Score](https://docs.typesafe.ai/primitives/score.md)   | Probability-weighted position on ordered levels; use comparable per-item Scores for graded ranking |

Give each question enough relevant **state** to answer: source text, identities,
relationships, policies, and current facts. Prefer named JSON fields when context
has several parts. Put the judgment in **instructions** and define its possible
answers in **criteria**. Question IDs are for code and are not sent to the model;
include complete meaning in the question. Reference nested state with backticked
paths such as `ticket.messages[0].text`.

Ask one narrow, coherent judgment per question. Split independently useful dimensions,
without destroying the relationship being judged. A bounded action selection or
contextual interpretation is valid; atomic does not mean literal fact extraction
or a one-sentence limit. Strings work for simple questions. Use structured objects
or arrays when definitions, contrasts, exclusions, or examples clarify instructions
or criteria. Score levels must describe concrete situations and stand on their own.

Keep the needed answers available. Include a no-match outcome when nothing may fit;
use a separate presence judgment when it is independently useful. For source-value
selection, check candidate coverage: the model cannot choose an omitted value.

### Compose and verify

**Ask independent questions over the same state together**, including useful
speculative questions. They run in parallel and cannot see one another's answers.
State each speculative premise explicitly; code consumes the applicable answers.
A second request is warranted when an earlier answer is needed to fetch evidence,
construct new state, or determine the next options. Extra questions still use tokens;
measure actual request budgets, cost, and end-to-end latency.

Use probabilities and confidence to guide behavior, with thresholds evaluated on
the user's data and consequences. Choice/Score confidence summarizes distribution
concentration, not overall workflow correctness or permission to act. A Noul near
0.5 means similar probability for yes and no, not medium intensity. Several
acceptable alternatives can also spread probability; low confidence need not
invalidate a harmless preference choice. Ignore uncertainty on unused branches.

Keep policy explicit and raw judgments reusable. Weighted scores suit compensating
preferences; an “any serious violation” rule needs separate conditions. Changing a
weight or display filter need not rerun inference when evidence and question meanings
are unchanged. Typed output guarantees the interface, not truth. System One models
are trained for calibrated decisions; validate their performance in the target domain.

Test representative cases and the resulting application behavior. For failures,
inspect the exact state, questions, candidates, answers, composition, and observed
outcome. Separate missing evidence, model errors, code errors, and service failures.
Treat cookbook thresholds and demo results as examples to evaluate, not universal
rules or permanent model limitations. Keep API credentials server-side in web apps.
