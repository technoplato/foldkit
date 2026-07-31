# Foldkit Product Requirements Document

**Document status:** Draft product baseline

**Version:** 0.1

**Prepared:** July 30, 2026

**Product:** Foldkit

## 1. Executive summary

Foldkit is a framework for building software whose behavior remains understandable as the product grows. It combines Effect, Schema, and an Elm-style Program architecture so that state transitions, effects, resources, navigation, replay, and host boundaries are explicit values rather than conventions spread across components.

The product thesis is that correctness should be a visible property of the architecture. A developer, reviewer, test suite, or machine-assisted tool should be able to answer the following questions without reconstructing hidden framework behavior:

- What is the authoritative state?
- Which facts can change it?
- Which external work may occur?
- Who owns that work and when is it cancelled?
- What happened in the past?
- Can the same Program run in another Client or Processor?
- Can an untrusted payload reach domain logic?
- Can a historical replay accidentally repeat a live effect?

Foldkit aims to make the safe path the direct path. It is not a bag of optional state-management utilities. A Foldkit Program adopts one coherent model for state, effects, lifecycle, testing, and inspection.

## 2. Product vision

### 2.1 Vision statement

Make correctness-oriented software development practical enough to be the default for product teams, and make application architecture legible enough that humans and machine-assisted tools can collaborate without relying on hidden behavior.

### 2.2 Product promise

A team should be able to define one portable Program and run it through many Clients and Processors while preserving the same domain meaning, transition behavior, replay semantics, and effect boundaries.

### 2.3 Industry ambition

Foldkit is intended to influence the broader software industry in five ways:

1. **Move architecture from convention to construction.** Important constraints should be encoded by types, schemas, runtime ownership, and tests rather than remembered through review folklore.
2. **Make effects auditable.** Network calls, storage, clocks, randomness, media, subscriptions, and resources should be named and attributable rather than hidden in component lifecycles.
3. **Separate Programs from presentation technology.** Product behavior should survive renderer changes, native expansion, terminal access, automation, and headless processing without a domain rewrite.
4. **Make replay a normal capability.** Historical inspection, support diagnostics, deterministic reproduction, and safe branching should be part of the runtime model rather than an application-specific afterthought.
5. **Create safer machine-assisted development surfaces.** Schemas, journals, validated actions, and bounded runtime controls should allow tools to inspect and operate software without guessing at undocumented internals.

The desired long-term outcome is not merely adoption of one framework. It is a higher expectation for the whole industry: application behavior should be explicit, portable, testable, replayable, and accessible by default.

## 3. Current product state

As of July 30, 2026, Foldkit is beyond an early framework prototype. It already contains a broad runtime, development tooling, accessible UI primitives, many reference applications, replay and DevTools infrastructure, and extensive cross-host proofs.

### 3.1 What is substantially implemented

- Schema-defined Model and Message contracts.
- Pure update-based state transitions.
- Typed Commands and result Messages.
- Subscriptions, Mount effects, ManagedResources, Ports, Submodels, and OutMessages.
- Foldkit HTML and virtual DOM rendering.
- Typed routing and state-preserving Vite integration.
- Story and Scene testing.
- Accessible UI primitives.
- Crash surfaces, slow-operation warnings, and DevTools.
- DevTools MCP with schema-validated Message dispatch.
- Runtime journal, replay, inspection, and live branching proofs.
- View-agnostic Program runtime experiments.
- React, React Native, CLI, terminal, and headless Client proofs.
- Navigation-as-state examples.
- Instant-backed shared Program and Processor experiments.
- Normalized multi-chain wallet examples, local custody, QR presentation, transfer flows, and secure transfer foundations.
- Strong CI and npm trusted-publishing automation.

### 3.2 What remains incomplete

- The active branch is 211 commits ahead of `origin/main` and has not been integrated.
- Twenty-one wallet-related files are currently modified but uncommitted.
- The full static check is not green because staked-access code still targets an older wallet contract.
- A React Native wallet test suite fails during module import with an invalid storage-owner record.
- The view-agnostic Runtime, public React adapter, generic Sharing surface, and some Client lifecycle contracts are not yet finalized public APIs.
- Navigation ADR status and broader carrier semantics need final review.
- Shared Program and Processor work requires production permission, reconnect, operations, and support hardening.
- Wallet transfer and custody work still has explicit production security and deployment gates.
- Eleven pending Changesets need to be reconciled to a deliberate release boundary.

Foldkit is therefore best described as **architecturally advanced, heavily proven, and not yet converged into a clean release candidate**.

## 4. Problem statement

Modern frontend and application development often distributes behavior across component state, effects, hooks, event handlers, data caches, routers, context providers, background tasks, platform callbacks, and server mutations. This creates several recurring problems:

- The source of truth is ambiguous.
- Effects can execute more than once or outlive the state that requested them.
- Navigation and presentation become separate state machines.
- Tests mock implementation details instead of exercising domain behavior.
- Renderer migration requires rewriting business logic.
- Offline and multi-process behavior is added as a second architecture.
- Historical debugging cannot distinguish observed facts from re-executed effects.
- Machine-assisted tools see files but not the actual runtime contract.
- Accessibility behavior is bolted onto visual components rather than designed into interaction state.

The burden grows nonlinearly. Teams compensate with more conventions, more libraries, and more coordination, while the product becomes harder to reason about.

## 5. Target users

### 5.1 Primary users

**Correctness-oriented application teams**

Teams building products where stale results, lifecycle leaks, duplicate effects, invalid states, or opaque failures are expensive.

**Effect and TypeScript developers**

Developers who want Effect capabilities expressed through a complete application architecture rather than ad hoc service calls.

**Cross-platform product teams**

Teams that need the same behavior in browser, native, terminal, embedded, automation, or headless environments.

**Framework and platform engineers**

Teams building reusable product foundations, design systems, runtime tooling, and internal platforms.

### 5.2 Secondary users

- Security and privacy reviewers.
- Accessibility engineers.
- Quality and release engineers.
- Developer-tool authors.
- Educators teaching state, effects, and functional architecture.
- Machine-assisted engineering systems that can consume schemas and journals.

## 6. Jobs to be done

A Foldkit user should be able to say:

- I can model every valid product state without contradictory flags.
- I can identify every fact that may change the Model.
- I can identify every external effect and its lifecycle.
- I can test a feature without rendering a browser.
- I can drive the actual view through accessible interactions when I need presentation proof.
- I can inspect how the Program reached its current state.
- I can replay history without repeating past effects.
- I can host the Program in another Client without rewriting the domain.
- I can embed a Program in an existing application through a typed boundary.
- I can let a remote or headless Processor execute a capability without giving it ownership of presentation or admission policy.
- I can upgrade Foldkit with an explicit migration path and reliable release notes.

## 7. Product principles

### 7.1 One authoritative Model

The Program Model is the source of visible domain truth. Foldkit should resist parallel state stores that can disagree with it.

### 7.2 Messages are facts

Messages describe what occurred or what the domain accepted. They are schema-validated and handled exhaustively.

### 7.3 Effects are values

Commands, Subscriptions, Mount effects, and ManagedResources make external behavior explicit and lifecycle-owned.

### 7.4 Programs outlive renderers

A Program should remain meaningful without a DOM, React, a native view system, or any particular Client.

### 7.5 Replay cannot repeat history

Historical reconstruction must remain inert. Only new accepted branch activity may execute new effects.

### 7.6 Schemas are operational contracts

Schemas are used for state, Messages, Ports, persistence, routes, journals, machine control, and untrusted boundaries. They are not documentation-only types.

### 7.7 Accessibility is behavior

Accessible interaction is part of component semantics and conformance, not a final visual QA step.

### 7.8 Examples are executable claims

Every major architectural promise should be proven by a runnable example, test matrix, or external pilot.

### 7.9 High-risk examples remain clearly bounded

Wallet, custody, and settlement examples may prove portability and effect boundaries without claiming audited production safety.

## 8. Product pillars

### 8.1 The Program architecture

Foldkit must provide the smallest complete vocabulary for Model, Message, update, init, restoration, Commands, Subscriptions, lifecycle resources, composition, and host communication.

**Product outcome:** A developer learns one architecture that remains valid from a small counter to a large connected product.

### 8.2 Portable Runtime

The Runtime must execute a Program independently from presentation and expose stable observation, lifecycle, journal, replay, and shutdown contracts.

**Product outcome:** Domain behavior can move among Clients and Processors without becoming a new implementation.

### 8.3 Safe effects and resources

Effect execution must preserve causality, cancellation, replacement, scope ownership, and typed failure behavior.

**Product outcome:** Duplicate, stale, leaked, and invisible effects become difficult to introduce and straightforward to diagnose.

### 8.4 Replay and operational understanding

Every Program should be inspectable through an ordered journal. Developers and support engineers should be able to inspect history, reconstruct state, and branch safely.

**Product outcome:** Bugs become reproducible artifacts instead of stories about what a user remembers doing.

### 8.5 Testing as direct Program interaction

Story tests should exercise transition logic directly. Scene tests should exercise rendered behavior through accessible semantics. Cross-host conformance should prove portability.

**Product outcome:** Tests describe product behavior and architectural invariants rather than framework implementation details.

### 8.6 Accessible UI system

Foldkit UI should provide composable primitives whose interaction states are modeled explicitly and whose keyboard, focus, screen-reader, and reduced-motion behavior are verified.

**Product outcome:** Product teams gain accessible defaults without giving up Model ownership.

### 8.7 Developer experience and scaffolding

Installation, project creation, local development, HMR, linting, documentation, examples, migration, and release flows should feel complete and predictable.

**Product outcome:** Correct architecture does not require a punishing setup or a private framework expert.

### 8.8 Shared Programs and Processors

Foldkit should provide a principled model for accepted Message tapes, offline proposals, capability placement, headless execution, artifact streams, and synchronization.

**Product outcome:** Collaborative and distributed applications extend the same Program architecture rather than introducing a second system.

### 8.9 Machine-readable runtime control

DevTools and MCP should expose state, history, schemas, and allowed actions through validated, least-privilege interfaces.

**Product outcome:** Machine-assisted tools can inspect and operate applications safely enough to support debugging, testing, and controlled automation.

## 9. Required product experiences

### 9.1 First application experience

A new user should be able to:

1. Run `create-foldkit-app`.
2. Choose a documented example or starter.
3. Install with the pinned supported toolchain.
4. Run the development server.
5. Change a Model or view and observe state-preserving HMR.
6. Add a Message and receive an exhaustive compile failure until update handles it.
7. Add a Command and test its success and failure Messages.
8. Run Story, Scene, type-check, lint, and production build commands.
9. Inspect the running Program through DevTools.

### 9.2 Existing application embedding

An existing application team should be able to embed a Foldkit Program through typed Ports, observe outputs, and dispose it without exposing internal Model or Message details.

### 9.3 Cross-client experience

A team should be able to use one Program core from at least three materially different Clients and verify the same domain transition suite against each.

### 9.4 Support and replay experience

A developer should be able to obtain a redacted, versioned replay artifact, inspect the exact transition sequence, reproduce the Model, and branch without re-running historical effects.

### 9.5 Upgrade experience

A user should be able to identify breaking changes, run a migration, validate package compatibility, and preserve or explicitly reset state and replay artifacts.

## 10. Product requirements by release horizon

### Horizon A: Converged pre-1.0 release

Purpose: turn the active body of work into a clean, repeatable, publishable release.

Required outcomes:

- Reconcile the active branch and working tree.
- Restore all static and test gates.
- Complete the normalized wallet API migration across every example.
- Resolve the React Native owner-partition failure.
- Audit and consolidate pending Changesets.
- Publish accurate maturity labels for experimental wallet and shared-Processor packages.
- Prove package tarballs, create-app smoke, docs, and website E2E from a clean commit.

### Horizon B: Public portable Runtime

Purpose: make view-agnostic execution a supported product contract.

Required outcomes:

- Final Program and Runtime public surface.
- Scoped startup and shutdown semantics.
- Stable observation and Client attachment contracts.
- Public journal and replay API.
- Public React lifecycle adapter with Strict Mode and server-rendering behavior.
- Renderer-independent package entry points.
- Cross-client conformance fixtures.

### Horizon C: Shared Programs and Processors

Purpose: extend one Program into distributed and local-first execution.

Required outcomes:

- Message proposal and acceptance protocol.
- Stable occurrence ordering and idempotency.
- Capability declaration and placement policy.
- Permission and identity model.
- Durable offline outbox and reconnect behavior.
- Artifact stream protocol.
- Operational dashboards and failure recovery.

### Horizon D: Foldkit 1.0

Purpose: establish a stable, supportable public platform.

Required outcomes:

- Documented compatibility and deprecation policy.
- Stable core runtime and package boundaries.
- Enforced accessibility and performance baselines.
- External production pilots.
- Security policy and vulnerability response.
- Maintainer and release ownership.
- Complete migration guides for supported prior releases.
- No unresolved P0 or P1 framework correctness, security, data-loss, or release defects.

## 11. Success metrics

### 11.1 Adoption and activation

- Percentage of generated projects that successfully install and build.
- Time from project creation to first passing Story test.
- Percentage of users who reach a production build without custom configuration.
- Number of external production applications using the core Program contract without a framework fork.

### 11.2 Correctness and reliability

- Duplicate or stale effect regressions reported per release.
- Runtime resource-leak regressions.
- Replay mismatches across supported versions.
- Percentage of public API changes with migration fixtures.
- Mean time to reproduce a reported issue from a journal artifact.

### 11.3 Portability

- Number of official Clients passing the shared conformance suite.
- Percentage of example domain code shared unchanged among Clients.
- Number of renderer-specific imports detected in Program cores.

### 11.4 Developer experience

- CI duration and flake rate.
- Create-app smoke reliability.
- Documentation task-completion rate in usability tests.
- Upgrade success rate on reference projects.

### 11.5 Accessibility

- Percentage of published primitives with automated keyboard, focus, role, and label coverage.
- Number of accessibility regressions in supported components.
- Conformance across browser and supported non-browser Clients.

### 11.6 Ecosystem health

- Number of third-party adapters and packages using supported public extension points.
- Release cadence and rollback frequency.
- Security response time.
- Ratio of public APIs with runnable examples and reference tests.

## 12. Competitive differentiation

Foldkit should not compete by having the largest plugin catalog or the fewest architectural constraints. Its differentiation is a complete and coherent model:

- Effect-native instead of Promise wrappers around component effects.
- Schema-driven instead of compile-time types that disappear at runtime boundaries.
- Elm-style Program ownership instead of distributed component state.
- Renderer portability instead of renderer-specific business logic.
- Built-in replay and causal diagnostics instead of logging-only debugging.
- Story and Scene tests instead of choosing between reducer tests and browser-only tests.
- Typed Ports and machine control instead of unrestricted internal access.
- Explicit resource lifecycle instead of cleanup conventions.

The product should accept that this is an opinionated choice. It should be excellent for teams that want the architecture and explicit about teams that do not.

## 13. Non-goals

Foldkit will not prioritize:

- Incremental adoption inside a Program through arbitrary hooks or local state.
- Hiding Effect or Schema to resemble a conventional React library.
- Supporting every renderer before the portable Runtime contract is stable.
- Building an application backend, database, or financial custodian into core.
- Preserving obsolete experimental APIs indefinitely.
- Optimizing examples for breadth at the expense of passing release gates.
- Claiming production safety from test count alone.

## 14. Risks and mitigations

### 14.1 Scope expansion

**Risk:** The repository proves many ambitious domains at once, which can delay a coherent public release.

**Mitigation:** Separate framework contracts, reference proofs, experimental adapters, and production services. Release only converged surfaces.

### 14.2 API instability

**Risk:** View-agnostic Runtime, replay, React, Sharing, navigation, and wallet work may create overlapping public APIs.

**Mitigation:** Finalize ADRs, establish one ownership model, run migration fixtures, and remove compatibility aliases that preserve contradictory architectures.

### 14.3 Example-driven coupling

**Risk:** Framework APIs may overfit Counter, Wallet, or one renderer.

**Mitigation:** Require at least two materially different domains and three Clients before promoting an example-local seam to public core.

### 14.4 Security signaling

**Risk:** Sophisticated wallet examples may be mistaken for audited custody infrastructure.

**Mitigation:** Use explicit maturity labels, disabled production settlement, threat models, and independent review gates.

### 14.5 Learning curve

**Risk:** Effect, Schema, and Elm architecture together may feel unfamiliar.

**Mitigation:** Provide a progressive curriculum, guided examples, clear error messages, scaffolding, and side-by-side explanations without weakening the architecture.

### 14.6 Machine-control overreach

**Risk:** MCP or remote tools could dispatch unsafe actions or expose sensitive state.

**Mitigation:** Publish allowlisted schemas, redact protected values, require explicit environment enablement, and keep read and write capabilities separate.

## 15. Product governance

- `CONSTITUTION.md` defines architectural rules that product convenience cannot silently override.
- `SRS.md` defines release-blocking system requirements.
- ADRs document durable technical decisions and alternatives.
- Changesets describe user-visible package effects.
- Changelogs record released behavior and migration.
- Examples prove claims but do not create public contracts by accident.
- A release cannot be called production-ready while required gates are red or while known high-risk limitations are obscured.

## 16. Definition of product success

Foldkit succeeds when a team can build a sophisticated product and still describe its behavior with a finite, inspectable system:

- one authoritative Model,
- closed Messages,
- deterministic update,
- explicit effects,
- controlled resources,
- portable Clients,
- capability-driven Processors,
- versioned journals,
- inert replay,
- accessible interaction,
- direct tests,
- and trustworthy releases.

At the industry level, success means that hidden state and invisible effects begin to feel as outdated as untyped network payloads. Software teams should expect architecture to provide evidence of correctness, not merely a place to organize files.
