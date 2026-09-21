# Design principles

Use these principles for design, refactoring, and test decisions. They express preferences, not a requirement to add abstractions. [Architecture](architecture.md) defines their application to Kvitto.

## Model the facts the code needs

Parse external input at its trust boundary. Return a value whose type retains the facts established by parsing, instead of a boolean followed by repeated checks. A type assertion does not establish those facts.

Keep structural validity separate from authority and mutable state. Parsing an email cannot prove ownership. A parsed receipt ID cannot prove access or that a revision is current; those checks belong in the transaction that uses it.

Use records for facts that coexist and discriminated unions for alternative states. Each case should contain only the data valid for that state. Give distinct quantities, identities, and proven states distinct types when this prevents real mistakes. Do not brand every primitive. Use optional fields for absence and `null` for a distinct state or explicit clearing operation.

## Separate decisions from effects

Prefer immutable values and small, composable functions. Domain calculations return new values without changing their inputs. Pass the smallest meaningful input; use named parameters where arguments could be confused. Supply time, randomness, and external results explicitly when a decision depends on them.

Represent expected failures and outcomes as typed data. Handle each case explicitly; avoid unrelated flags, sentinel values, and broad catches that hide failure ownership. Derive displayed messages from domain issues, not domain decisions from displayed text.

Keep database, network, storage, and UI operations at explicit boundaries. Coordination owns sequencing, failure handling, and completion; domain functions own decisions. Prepare shared evidence once and batch independent work where practical. Use the existing platform's transaction and workflow facilities before adding another execution framework.

## Give responsibilities one owner

Name the domain responsibility before choosing a function, module, type, or interface. Repeated checks can indicate a missing invariant; repeated code alone does not require a new class. A helper is sufficient when it captures the complete responsibility.

Keep each rule, default, identifier definition, and state value authoritative in one place. Derive related values, types, and parsers where practical. Split modules by responsibility. Add an abstraction when it removes coupling or establishes a contract; avoid forwarding layers and speculative generalization. Keep comments aligned with ownership.

## Design collaborators from their consumers

Define the smallest application-owned role that a caller needs. Inject a function for a single operation or a small interface for related operations. An adapter earns its place by translating an external contract or owning a policy.

Use mocks to test these roles, not to reproduce a vendor SDK or a chain of internal objects. Stub required query results and verify commands that express required effects. Test adapters against the real integration contract as appropriate. Many mocks or mocks with business logic are reasons to reconsider responsibility boundaries.

## Test behavior that matters

Use value assertions for parsers and pure calculations. Test state transitions, transaction behavior, and meaningful failures. Derive expected results independently from the implementation.

Required commands and forbidden effects are observable behavior. For example, an unauthorized request must not write data. Internal helper calls are not a contract. Assert order or call counts only when correctness depends on them. Tests should permit behavior-preserving refactoring; avoid tautologies, change detectors, and tests that only confirm deleted code stays absent.

## Foundations

- [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/): preserve established facts in types.
- [Mock Roles, Not Objects](https://jmock.org/oopsla2004.pdf), Freeman, Mackinnon, Pryce, and Walnes: discover interfaces from required collaborations.
- [F# functional programming](https://learn.microsoft.com/en-us/dotnet/fsharp/tutorials/functional-programming-concepts) and [component design](https://learn.microsoft.com/en-us/dotnet/fsharp/style-guide/component-design-guidelines): immutable values, composition, and explicit contracts. Apply these ideas with idiomatic TypeScript; no new functional framework is required.
