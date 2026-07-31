# Foldkit Engineering Constitution

**Status:** Governing draft

**Version:** 0.1

**Adopted for review:** July 30, 2026

## Preamble

Foldkit exists to make software behavior explicit enough to reason about, test, replay, port, and operate with confidence. This constitution defines the rules that protect that purpose.

These rules apply to Foldkit core, published packages, official examples, Clients, Processors, adapters, developer tools, documentation, and release work. They also define the standard expected from applications presented as canonical Foldkit examples.

Convenience, novelty, compatibility pressure, visual preference, or schedule pressure may not silently override these rules. A deliberate exception requires a written decision, bounded scope, tests, and a removal or review date.

Normative language has the following meaning:

- **MUST** and **MUST NOT** are non-negotiable for production or public release.
- **SHOULD** and **SHOULD NOT** are strong defaults. A deviation requires documented reasoning.
- **MAY** identifies a permitted option.

## Article I | The Program owns domain truth

1. A Foldkit Program MUST have one authoritative Model for its visible domain state.
2. A renderer, hook, service, router, cache, global variable, process adapter, or platform callback MUST NOT become a second authoritative domain store.
3. Presentation-only state MAY live in a Client only when it cannot alter domain meaning, replay, permissions, navigation validity, or effect decisions.
4. Any state that affects available actions, effect execution, restoration, user-visible outcomes, or cross-client consistency MUST be represented in the Program or an explicitly composed Submodel.
5. Invalid combinations SHOULD be unrepresentable through Schema-backed unions and Options rather than prevented by scattered conditionals.

**Review question:** Where is the single value that answers what the product currently believes?

## Article II | Messages are validated facts

1. Messages MUST describe facts that occurred or decisions accepted by the domain.
2. Message unions MUST be closed and Schema-defined.
3. Every Message variant MUST be handled exhaustively by update.
4. Unknown, malformed, unauthorized, incompatible, or stale external payloads MUST be rejected before update.
5. Messages MUST NOT contain live service objects, SDK clients, functions, secret handles, DOM nodes, private keys, or uncontrolled platform values.
6. A Message SHOULD retain enough stable identity and causality to support replay, deduplication, and diagnostics.
7. A `NoOp` Message is prohibited. An ignored event must be named as the fact that it was ignored or suppressed when that fact matters.

**Review question:** Is this Message a domain fact, or is it an instruction that exposes an implementation detail?

## Article III | update is deterministic and exhaustive

1. update MUST be a pure function of Model and Message.
2. update MUST NOT read ambient time, randomness, network state, storage, process globals, renderer state, or platform services.
3. update MUST return the next Model and declared effects as values.
4. Equivalent validated inputs MUST produce equivalent next state and effect descriptions.
5. Every state transition that can fail, wait, retry, cancel, or be replaced SHOULD model that lifecycle explicitly.
6. State transitions MUST NOT depend on call order hidden outside the Runtime.
7. Exhaustiveness is a build property. Runtime fallbacks are reserved for untrusted external input, not missing domain cases.

**Review question:** Can this transition be reproduced without booting the host or mocking ambient state?

## Article IV | Effects are explicit and causally owned

1. One-shot external work caused by a Message MUST be a Command.
2. External streams selected by Model MUST be Subscriptions.
3. Element-owned host work MUST use Mount.
4. Model-selected stateful resources used across effects MUST use ManagedResource or another reviewed lifecycle primitive.
5. Native custom elements MUST use the CustomElement boundary.
6. Every effect MUST have an identifiable owner, start condition, completion path, cancellation path, and cleanup behavior.
7. Historical replay MUST NOT re-execute historical effects.
8. Late results from replaced, cancelled, or superseded work MUST be rejected or modeled explicitly.
9. Irreversible work MUST define idempotency and outcome-unknown behavior before production use.
10. Views MUST NOT launch business-critical effects or own their cancellation.

**Review question:** Which primitive owns this work, and what ends it?

## Article V | Programs are independent from Clients

1. A Program MUST remain executable without a DOM or visual renderer unless it is explicitly a renderer-only package.
2. Business logic MUST NOT branch on React, React Native, browser, terminal, operating system, or device brand.
3. Platform differences MUST enter through capabilities, adapters, and injected Layers.
4. Clients render state and translate native input into validated Messages. They do not invent domain transitions.
5. The same Program SHOULD support multiple Clients without duplicating its Model or update rules.
6. Client connect, disconnect, suspension, replacement, and failure MUST NOT corrupt the Program or another Client.
7. Renderer-specific convenience APIs MUST be adapters over the portable Runtime, not competing runtimes.

**Review question:** Could a nonvisual Client consume this Program without reimplementing its meaning?

## Article VI | Processor placement is capability-driven

1. Authentication and session membership determine whether a proposal or Message may be admitted.
2. After admission, Processor selection MUST be based on declared capability, affinity, cardinality, availability, policy, and version.
3. Device type, renderer, manufacturer, or operating system MUST NOT serve as an implicit authorization rule.
4. Processors MUST declare the work they can execute and the behavior when none are available.
5. A Processor MUST return factual results through the accepted Program protocol. It MUST NOT mutate Model directly.
6. Placement decisions and generations MUST be observable and attributable.
7. Exactly-once claims require durable protocol evidence. They MUST NOT be claimed from in-memory deduplication alone.

**Review question:** Is this work assigned because the Processor is authorized and capable, or because of an accidental host assumption?

## Article VII | Schemas guard every trust boundary

1. Model, Message, Ports, persisted records, routes, journals, shared records, machine-control payloads, and adapter results MUST be validated where trust changes.
2. TypeScript types alone are insufficient for runtime trust boundaries.
3. Identifiers MUST define their namespace, allowed shape, length, canonical form, and collision behavior.
4. Closed enums remain closed unless an explicit compatibility design introduces an unknown case.
5. Schema migration MUST be deterministic, tested, and version-aware.
6. A decode failure MUST fail closed with a typed, sanitized error.
7. Cross-record referential integrity MUST be checked when it cannot be expressed by one Schema.
8. Compatibility aliases MUST NOT preserve two contradictory architectures indefinitely.

**Review question:** Which untrusted value reaches this boundary, and where is it decoded?

## Article VIII | Replay preserves history without repeating it

1. A Runtime journal MUST preserve accepted Message order and sufficient versioned metadata to reconstruct Program state.
2. Historical replay MUST use inert effect Layers.
3. Replay MUST NOT sign, submit, settle, notify, publish, mutate storage, or open live resources on behalf of historical Messages.
4. A live branch from history MUST receive a new causal identity.
5. New branch effects MUST execute no more than once for the accepted branch transition.
6. Replay migration and refusal behavior MUST be explicit.
7. An incompatible tape MUST NOT be partially applied as though it were valid.
8. Journal inspection MUST honor redaction and authorization policies.
9. URLs that represent current navigation MUST NOT silently become unbounded event tapes.

**Review question:** Can replay reconstruct the past while remaining incapable of repeating a past external action?

## Article IX | Secrets never become Program data

1. Private keys, recovery phrases, raw access tokens, secret provider credentials, signing capabilities, and recoverable secret material MUST NOT enter Model, Message, Command payloads, journals, replay artifacts, routes, logs, crash reports, DevTools, or MCP.
2. Secret use MUST occur behind an injected, least-privilege capability.
3. Public account identity and secret custody MUST remain separate concepts.
4. Redaction MUST happen before a value enters a general logging or inspection system.
5. Storage and transport adapters MUST use explicit owner partitions for protected records.
6. Timing-sensitive comparisons, cryptographic validation, and memory wiping belong to reviewed host capabilities.
7. Examples that handle secrets MUST state their threat model and maturity.

**Review question:** Could this value allow an observer, replay consumer, log reader, or Client to recover authority?

## Article X | High-risk operations fail closed

1. Financial, credential, publication, remote-control, and security-sensitive workflows MUST reject ambiguous state rather than infer success.
2. Durable intent SHOULD be recorded before an irreversible external call when duplicate execution is possible.
3. A timeout after an irreversible boundary MUST become an explicit outcome-unknown state.
4. Blind retry is prohibited when it could duplicate a payment, publication, transfer, or destructive action.
5. Production settlement, custody transfer, or public control MUST remain disabled until its security and operational gates are satisfied.
6. A sophisticated example MUST NOT be marketed as audited infrastructure without independent evidence.
7. Rate limits, lifetime limits, payload bounds, cleanup, and abuse behavior MUST be defined before public deployment.

**Review question:** What happens when the process loses the response after the external system may already have acted?

## Article XI | Composition preserves boundaries

1. A Submodel owns its internal Model, Messages, update behavior, and interaction state.
2. Parent Programs MUST communicate through typed child Message envelopes and OutMessages.
3. Parents MUST NOT inspect or mutate hidden child internals.
4. OutMessages SHOULD report domain outcomes rather than implementation events.
5. Embedding MUST use Schema-typed Ports and a complete disposal boundary.
6. An embedded host MUST NOT read the Program Model or dispatch arbitrary internal Messages.
7. Shared utilities MUST not smuggle synchronization, global state, or renderer dependencies into product sources.

**Review question:** Does this composition depend only on the declared public contract?

## Article XII | Navigation and presentation are state

1. Valid destinations and presentations SHOULD be represented by Schema-backed unions.
2. Mutually exclusive presentations MUST be structurally exclusive.
3. Route parsing and printing MUST be typed and tested for round trips.
4. Browser history, native navigation, terminal commands, and file-based routing are carriers. They are not the canonical domain state.
5. External navigation MUST re-enter the Program through a Message.
6. Missing or stale external destinations MUST normalize through explicit policy.
7. A Client MUST NOT maintain a second navigation state machine that can disagree with the Program.

**Review question:** Can the Model represent exactly the destination the user sees, without contradictory flags?

## Article XIII | Accessibility is a correctness requirement

1. Published UI primitives MUST define keyboard, focus, semantic role, labeling, disabled, dismissal, and reduced-motion behavior where applicable.
2. Accessibility MUST be tested through behavior and semantics, not inferred from appearance.
3. Stateful components SHOULD model interaction through Submodels.
4. Clients MUST preserve domain meaning and accessible labels across presentation choices.
5. New component variants MUST not weaken existing accessibility guarantees.
6. Accessibility regressions are release defects, not optional polish.

**Review question:** Can a keyboard and screen-reader user complete the same domain action with the same outcome?

## Article XIV | Tests prove behavior at the right layer

1. update logic MUST be testable directly through Story or equivalent Program-level tests.
2. Views SHOULD be tested through Scene or accessible interaction tests.
3. Adapter contracts MUST have integration tests at the boundary they claim to support.
4. Cross-client claims MUST use a shared conformance suite.
5. A build-only result MUST NOT be reported as runtime proof.
6. A unit test MUST NOT be reported as network, browser, device, or security acceptance evidence.
7. Flaky tests are defects. Re-running until green is not an acceptance strategy.
8. Every regression fix SHOULD add the smallest test that would have prevented it.
9. Intentional skips MUST include an owner, reason, and production implication.

**Review question:** Does the evidence exercise the actual layer named in the claim?

## Article XV | Performance and observability remain bounded

1. update, view, patch, subscription extraction, serialization, replay, and journal inspection SHOULD have defined budgets.
2. Runtime queues, journals, resources, listeners, caches, diagnostic buffers, and pending effects MUST be bounded or intentionally persisted.
3. Metrics labels MUST have bounded cardinality.
4. Logs MUST be structured, causal, and redaction-aware.
5. Diagnostics SHOULD identify Program, Runtime instance, Message, effect, resource, version, and stage without protected payloads.
6. Optimization MUST preserve semantic behavior and replay equivalence.
7. Performance acceptance requires representative workloads, not microbenchmarks alone.

**Review question:** What bounds the lifetime and size of this work under sustained use?

## Article XVI | Public APIs require evidence and stewardship

1. An example-local seam MUST NOT become public merely because more than one file imports it.
2. A candidate public API SHOULD survive at least two materially different domains and three Clients or adapters when portability is part of its claim.
3. Every public export MUST have TSDoc, tests, and a runnable example or reference fixture.
4. Public packages MUST declare supported peer and runtime versions.
5. Breaking changes require Changesets, migration guidance, and compatibility fixtures.
6. Deprecation MUST include a supported replacement and removal horizon.
7. Package entry points MUST not expose secret or implementation-only surfaces.
8. Generated distribution artifacts MUST be tested from the package boundary, not only from source aliases.

**Review question:** Is this API stable because it has survived evidence, or only because current code happens to use it?

## Article XVII | Examples are executable product claims

1. Official examples MUST build and test against current public contracts.
2. An example that is intentionally incomplete MUST state its limitations at the point of discovery.
3. Examples MUST not carry compatibility code that keeps a retired architecture alive without a migration plan.
4. Cross-platform examples MUST share domain code rather than imitate the same behavior independently.
5. Wallet, staked-access, synchronization, and machine-control examples MUST include explicit security and deployment boundaries.
6. Checked-in screenshots and captures are evidence only when their provenance and expected behavior are documented.
7. An example that blocks the workspace release gate must be repaired, quarantined, or removed from the release boundary. It must not remain silently broken.

**Review question:** What exact claim does this example prove, and what does it explicitly not prove?

## Article XVIII | Releases are evidence-bearing events

1. A release MUST originate from a clean, reviewed commit.
2. The complete required CI matrix MUST pass under the pinned toolchain.
3. All public changes MUST have accurate Changesets and release notes.
4. Package tarballs MUST be inspected for expected exports and excluded private files.
5. npm publication MUST use trusted publishing and provenance.
6. The release must identify experimental surfaces and known limitations.
7. A rollback or corrective-release plan MUST exist.
8. A red release gate cannot be waived by describing the failure as unrelated. It must be fixed, quarantined through an explicit release decision, or removed from the release scope.
9. Test count alone is not release readiness.
10. Security-sensitive packages require the additional gates stated in their threat model.

**Review question:** Can an external user reproduce, understand, and safely upgrade this exact release?

## Article XIX | Documentation is part of the architecture

1. `SRS.md` defines system requirements.
2. `PRD.md` defines product outcomes, users, scope, and industry ambition.
3. This constitution defines non-negotiable engineering principles.
4. ADRs record durable technical decisions, alternatives, consequences, and open questions.
5. Changesets and changelogs record user-visible change and migration.
6. Documentation MUST distinguish implemented, verified, experimental, proposed, and production-ready states.
7. Aspirational language MUST NOT be presented as completed evidence.
8. Examples and commands in public documentation MUST be exercised in CI or a documented release check where practical.

**Review question:** Would a new maintainer understand both the intended system and the limits of the current implementation?

## Article XX | Simplicity means one coherent system

1. Foldkit SHOULD minimize concepts, but it MUST NOT hide necessary lifecycle, failure, authorization, or replay state to appear simple.
2. A second architecture is not an acceptable shortcut.
3. Convenience wrappers MUST preserve the same Program, Runtime, and effect semantics.
4. New primitives require evidence that existing primitives cannot express the lifecycle cleanly.
5. Abstractions SHOULD be promoted from repeated, understood behavior rather than speculative generality.
6. The shortest code is not automatically the simplest system. The simplest system is the one whose behavior remains finite and inspectable.

**Review question:** Does this change reduce the number of systems a maintainer must understand, or merely conceal another one?

## Article XXI | Human and machine collaboration use the same truth

1. Machine-assisted tools MUST consume the same schemas, journals, tests, and public contracts available to human maintainers.
2. Tools MUST NOT receive unrestricted access to internal state merely for convenience.
3. Machine-dispatched Messages or operations MUST pass the same validation and authorization as human-triggered actions.
4. Generated changes remain subject to the same tests, reviews, release gates, and security boundaries.
5. Runtime introspection SHOULD produce useful causal context without exposing secrets.
6. The architecture should make a correct change easier to identify than a plausible but unverifiable change.

**Review question:** Is the tool operating through a bounded contract, or bypassing the architecture it is meant to help maintain?

## Article XXII | Industry responsibility

Foldkit should raise expectations beyond its own repository.

1. It SHOULD demonstrate that functional architecture can support polished, connected, cross-platform products.
2. It SHOULD publish reusable evidence for replay safety, lifecycle ownership, accessibility, synchronization, and schema evolution.
3. It SHOULD make architectural tradeoffs visible instead of presenting framework magic.
4. It SHOULD help teams treat product behavior as an inspectable artifact.
5. It MUST avoid overstating security, portability, or production maturity.
6. It SHOULD encourage an ecosystem in which frameworks are judged by the guarantees they make enforceable, not by how little structure they require.

## Governance

### 1. Authority

This constitution governs public and production Foldkit work. `SRS.md` may add more specific requirements but may not weaken these articles without amendment.

### 2. Exceptions

A temporary exception must include:

- the exact article affected;
- the bounded package, example, or release scope;
- why a compliant design is not yet practical;
- the user and security impact;
- tests and controls that limit the risk;
- an owner;
- a review or expiration date;
- and a plan to remove the exception.

An undocumented exception is a defect.

### 3. Amendments

An amendment requires:

1. A written proposal or ADR.
2. At least one concrete example of the problem it solves.
3. Analysis of compatibility, replay, security, accessibility, and cross-client consequences.
4. Updated tests and documentation.
5. An explicit version increment to this document.
6. Maintainer approval before a release that depends on the amendment.

### 4. Conflict resolution

When principles conflict, apply this order unless an amendment says otherwise:

1. Prevent secret exposure, unauthorized action, irreversible duplication, and data loss.
2. Preserve deterministic Program semantics and replay correctness.
3. Preserve accessibility and user-visible truth.
4. Preserve compatibility or provide an explicit migration.
5. Preserve portability across Clients and Processors.
6. Optimize performance and convenience.

### 5. Compliance evidence

A substantial release should include a short constitutional review that identifies:

- articles materially affected;
- new trust boundaries;
- new or changed public contracts;
- replay and lifecycle consequences;
- accessibility evidence;
- security-sensitive exceptions;
- and any temporary deviations.

## Ratification standard

This constitution is successful when it makes common architectural failures structurally difficult, makes necessary exceptions visible, and gives contributors a shared method for deciding what Foldkit should become.

The governing idea is simple: behavior that matters must be explicit enough to validate, own, replay, test, and explain.
