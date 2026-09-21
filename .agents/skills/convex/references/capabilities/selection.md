# Capability selection and project setup

Use for a requested backend addition, new project, or a concrete case where existing code duplicates a supported facility. Read the applicable recipe only after the need is established.

| Need                                                             | Existing guidance or candidate                                                                                                    |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Durable agent threads, tools, or retrieval                       | [Agent recipe](agent.md); do not require this component for every AI judgment                                                     |
| Subscription billing                                             | [Billing recipe](billing.md), with current provider and platform requirements                                                     |
| Recurring server jobs                                            | [Scheduling recipe](crons.md); use built-in scheduling before assuming another component is needed                                |
| Custom DNS and auth origin                                       | [Domain recipe](domains.md)                                                                                                       |
| Authentication, secrets, fixtures                                | [Integration operations](auth-and-environment.md)                                                                                 |
| Reusable component with owned tables                             | [Component authoring](../component-authoring/guide.md)                                                                            |
| Multi-step durable work or bounded execution                     | Inspect the installed workflow/workpool components and their version-matched documentation                                        |
| Counters, totals, throttling, search, presence, or collaboration | Evaluate sharded-counter, aggregate, rate-limiter, built-in search, presence, or editor components against the actual requirement |
| Files, text search, or realtime reads                            | Consider existing Convex storage, indexes, and subscriptions before adding another service                                        |

The original component suggestions also mapped email to a delivery component, push notifications to an Expo integration, embeddings to a retrieval component, and collaborative documents to a synchronization component. These are candidates to investigate, not mandatory substitutions. Check whether an equivalent package is already installed, what it guarantees, its maintenance status, and the migration cost. Recommend it only when it improves the requested work.

For a new application, select the requested platform first. The former quickstart used a Next.js template; that is not a suitable default for this existing Expo application. Use the current official scaffold for a new project, preserve the selected environment and authentication, start the appropriate local services, and verify the resulting app. Do not rerun a successful scaffold over existing work. If scaffolding is unavailable, build the minimal requested structure and state what could not be run.

The former capability catalogue used a provider-specific remote endpoint and unavailable fallback scripts. Preserve the process of searching a current component catalogue, reading the package documentation, and wiring the chosen capability; do not execute an uninspected remote helper or require that endpoint to keep working.
