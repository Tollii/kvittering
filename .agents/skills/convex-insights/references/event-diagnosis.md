# Runtime evidence and root-cause analysis

Use when deployment evidence identifies a read limit, transaction contention, or recurring failure. Record the actual deployment, tool availability, authorization mode, and returned time window. Earlier tooling exposed 72-hour insight events; do not assume every tool or deployment supports the same window. Missing events are not proof that no failures occurred.

| Evidence                                          | Investigation                                                                                                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `documentsReadLimit` / `bytesReadLimit`           | Identify the affected function and table, query scope, missing pagination, and repeated reads. Distinguish a hard failure from a threshold warning. |
| `documentsReadThreshold` / `bytesReadThreshold`   | Determine growth, call volume, and proximity to the relevant limit.                                                                                 |
| `occRetried`                                      | Inspect the conflicting document and transaction read/write set; repeated retries can add cost even when calls eventually succeed.                  |
| `occFailedPermanently`                            | Identify user-visible failure, shared write contention, retry exhaustion, and recovery.                                                             |
| Failed requests or repeated cron failures in logs | Trace the request, deployed revision, validation boundary, external provider, and retry behavior.                                                   |

An event proves a symptom happened; it does not by itself prove the hypothesized cause. Correlate request identifiers, timestamps, deployed source, and relevant data shape. Use table/schema information and the public/internal function surface only when needed for the investigation.

Possible fixes include narrowing a read set, indexed and paginated reads, shared prepared evidence, an aggregate for repeated counts, partitioned counters, or bounded execution. Select by the observed cause and correctness requirements, not the event name alone. Preserve complete results and transaction invariants.

Report the observation, source location and mechanism, confidence, impact, proposed correction, and verification. Separate hard limit failures from approaching limits and occasional successful retries. After an authorized fix, compare the same signal over a meaningful traffic period; do not call a quiet window proof of recovery without relevant traffic.
