# Foldkit Software Requirements Specification

**Document status:** Draft baseline for product and engineering alignment

**Version:** 0.1

**Prepared:** July 30, 2026

**Applies to:** The Foldkit monorepo, its published packages, reference applications, runtime hosts, adapters, developer tools, and release process

## 1. Purpose

This Software Requirements Specification defines the behavior, quality attributes, boundaries, and release evidence required for Foldkit to become a production-grade framework for correctness-oriented software.

Foldkit is a TypeScript framework built on Effect and organized around an Elm-style architecture. Its central promise is that application behavior can be made explicit, inspectable, portable, replayable, and testable by construction. A Foldkit Program owns its domain model and transition logic. Runtime instances execute declared effects. Clients render or otherwise present the Program. Processors may execute capabilities without owning a user interface.

This specification separates three questions:

1. **What the product should accomplish** is defined in `PRD.md`.
2. **What the system must do** is defined here.
3. **How contributors must make decisions** is governed by `CONSTITUTION.md`.

Normative terms use the following meanings:

- **MUST** and **MUST NOT** identify release-blocking requirements.
- **SHOULD** and **SHOULD NOT** identify defaults that require an explicit written exception.
- **MAY** identifies an optional capability.

## 2. Current implementation baseline

This specification is grounded in the repository state inspected on July 30, 2026.

- The active branch is `ml/exploring-view-agnosticism`.
- The branch is 211 commits ahead of `origin/main` and is not behind it.
- The working tree contains 21 modified wallet and client files with approximately 3,474 insertions and 402 deletions.
- The repository contains 124 workspace projects, approximately 4,989 tracked files, 3,352 TypeScript or JavaScript source files, 692 test files, 822 Markdown or MDX files, and 11 pending changesets.
- Existing continuous integration checks formatting, changesets, linting, dead code, circular dependencies, package builds, type checking, tests, create-app smoke behavior, and website Playwright smoke behavior.
- Existing release automation uses Changesets, npm trusted publishing, and provenance.
- ADRs establish or explore a view-agnostic Program runtime, universal journal replay, navigation as state, portable wallet custody, and normalized multi-chain adapters.
- Focused verification of the changed wallet area produced 131 passing tests and 5 skipped tests. One React Native showcase suite currently fails during module import with `WalletVaultStorageError: InvalidRecord`.
- The full static check currently fails in `examples/staked-access/core` because that example still consumes wallet types and schema fields removed or renamed by the normalized wallet migration.

The baseline demonstrates substantial architecture and test depth. It is not currently a shippable release state because branch integration, working-tree convergence, cross-example compatibility, and complete release gates remain open.

## 3. System scope

### 3.1 In scope

Foldkit includes the following product surfaces:

- The core Program and Runtime APIs.
- Schema-defined Model and Message contracts.
- Pure update functions and explicit Commands.
- Subscriptions, Mount effects, Managed Resources, and lifecycle diagnostics.
- Portable Program execution across browser, React, React Native, CLI, terminal UI, and headless Processor hosts.
- HTML and virtual DOM rendering.
- Typed routing, navigation state, and scene restoration.
- Embedding through Schema-typed Ports.
- Reusable accessible UI primitives and field validation.
- Story and Scene test tooling.
- Runtime journals, replay, inspection, and time travel.
- DevTools and DevTools MCP.
- Crash reporting and slow-operation diagnostics.
- Vite tooling, state-preserving HMR, scaffolding, Markdown support, and linting rules.
- Instant-backed shared Program and Processor experiments.
- Portable wallet, custody, transfer, QR, and chain-adapter examples that prove the architectural model.
- Documentation, reference applications, migration guides, conformance tests, and release automation.

### 3.2 Out of scope unless separately specified

Foldkit does not itself promise to provide:

- A general-purpose hosted backend for every application.
- A universal database abstraction.
- A production cryptocurrency custodian or audited settlement service.
- Legal, regulatory, or financial compliance for applications built with its examples.
- A single required renderer, component style, hosting provider, or synchronization provider.
- Automatic correctness when application schemas, domain rules, or effects are incorrectly specified.
- Compatibility with arbitrary local component state or uncontrolled side effects inside a Program.

## 4. Terminology and system model

### 4.1 Program

A **Program** is the portable domain definition consisting of:

- A Schema-defined Model.
- A Schema-defined Message union.
- Initialization or restoration behavior.
- A pure, exhaustive update function.
- Declared Commands, Subscriptions, Managed Resources, Mount effects, Ports, and optional OutMessages.
- Optional views or host-specific adapters that consume the same domain contract.

### 4.2 Runtime instance

A **Runtime instance** owns one execution of a Program. It serializes accepted Messages, applies update transitions, manages effects and lifecycle resources, records journal entries, and exposes controlled inspection or embedding boundaries.

### 4.3 Client

A **Client** presents Program state or accepts user input. A Client may be visual, terminal-based, assistive, automated, or embedded in another application. A Client does not own authoritative domain state outside the Program.

### 4.4 Processor

A **Processor** executes declared capabilities for accepted Program work. It may be headless. Processor selection is based on declared capability, affinity, cardinality, availability, and policy. It is not based on renderer identity or hard-coded device-brand allowlists.

### 4.5 Journal and replay

A **Journal** is the ordered record of accepted Messages and resulting transition facts needed to inspect or reconstruct Program behavior. **Replay** reconstructs historical behavior without repeating historical external side effects.

### 4.6 Port and adapter

A **Port** is a Schema-typed host boundary for input or output. An **adapter** translates between a host, platform, service, chain, renderer, or device API and the Program's normalized domain contract.

## 5. Stakeholders and user classes

- **Application engineers** need one scalable architecture for state, effects, lifecycle, and tests.
- **Platform teams** need portable domain behavior that can be hosted by multiple renderers and processes.
- **Library authors** need stable extension points and explicit compatibility contracts.
- **Security reviewers** need secrets, authorization, effects, and trust boundaries to be findable.
- **Quality engineers** need deterministic stories, scenes, replay, and conformance suites.
- **Design-system teams** need accessible primitives whose interaction state is explicit and testable.
- **Operations teams** need provenance, diagnostics, release rollback, and supportable failure modes.
- **Machine-assisted development tools** need schemas, journals, validated actions, and bounded control surfaces rather than inferred hidden behavior.
- **End users** need reliable, accessible applications whose behavior remains understandable across upgrades, reconnects, and failures.

## 6. Functional requirements

### 6.1 Program definition and transition semantics

**FK-FR-001: Schema-defined state**

Every production Program MUST define its authoritative Model with Effect Schema or an equivalent Foldkit-supported schema contract. Persisted, transported, inspected, and replayed state MUST be validated at its boundary.

**FK-FR-002: Schema-defined messages**

Every Message entering a production Program MUST belong to a closed, validated Message schema. Unknown, malformed, stale, or unauthorized Messages MUST be rejected before update execution.

**FK-FR-003: Domain facts instead of control instructions**

Messages SHOULD describe facts that occurred or domain decisions that were accepted. UI gestures, provider callbacks, and transport details SHOULD be translated into domain facts at an adapter boundary.

**FK-FR-004: Pure update**

The update function MUST be deterministic for the same Model and Message. It MUST NOT perform ambient I/O, read uncontrolled clocks or randomness, mutate hidden state, or directly access platform APIs.

**FK-FR-005: Exhaustive transition handling**

Every Message variant MUST be handled exhaustively. Adding a Message MUST produce a compile-time or conformance failure until its transition behavior is defined.

**FK-FR-006: State and effects returned together**

Each update MUST return the next Model and zero or more declared effects, including Commands or equivalent lifecycle instructions. The next Model MUST be available independently of effect completion.

**FK-FR-007: Controlled nondeterminism**

Time, randomness, identifiers, network responses, storage responses, and other nondeterministic values MUST enter through controlled dependencies and return to the Program as validated facts.

### 6.2 Effects and lifecycle

**FK-FR-008: Commands as values**

One-shot side effects MUST be represented as named, typed values. Commands MUST declare the Message schemas they may return.

**FK-FR-009: Causal completion**

Command completion MUST remain attributable to the initiating transition, runtime instance, and command identity. Stale completion from replaced or cancelled work MUST NOT mutate current state unless the Program explicitly accepts it.

**FK-FR-010: Cancellation and replacement**

Commands that can outlive the state that requested them MUST define cancellation, replacement, timeout, and late-result behavior.

**FK-FR-011: Subscriptions from Model**

Long-lived event streams MUST be declared as a function of Model. The Runtime MUST diff subscription identity and stop streams that are no longer required.

**FK-FR-012: Managed Resources**

WebSockets, media sessions, peer connections, file watchers, database observers, and similar resources MUST have explicit acquire, ownership, replacement, and release semantics.

**FK-FR-013: Mount boundary**

Direct access to a live host object MAY occur through a Mount boundary. Mount acquisition and cleanup MUST be paired, and results MUST return through validated Messages.

**FK-FR-014: No view-owned business effects**

Views MUST NOT own business-critical tasks, storage, networking, authorization, or Program synchronization. Views MAY dispatch Messages and render state.

### 6.3 Portable runtime and host behavior

**FK-FR-015: View-agnostic execution**

The core Program runtime MUST be able to execute without a browser DOM or a visual renderer.

**FK-FR-016: One Program, multiple clients**

A Program SHOULD be consumable by multiple Clients without duplicating domain transitions. Browser, React, React Native, CLI, TUI, and headless hosts MUST adapt to the Program rather than fork its domain model.

**FK-FR-017: Independent runtime instances**

Multiple Runtime instances MAY execute the same Program. Instance identity, accepted Message ordering, resource ownership, and synchronization MUST be explicit.

**FK-FR-018: Client lifecycle isolation**

Connecting, disconnecting, suspending, or replacing one Client MUST NOT corrupt the Program or another Client. Client-specific presentation state MUST be modeled or isolated intentionally.

**FK-FR-019: Processor admission and placement separation**

Authentication and session membership decide whether a Message or proposal is admitted. Executor placement MUST then be determined by declared capability and policy. Authorization MUST NOT be inferred from device category.

**FK-FR-020: Capability declarations**

Processors MUST declare the capabilities they can execute, their availability, cardinality, affinity, version, and failure behavior. Selection MUST be observable and testable.

### 6.4 Journal, replay, and inspection

**FK-FR-021: Ordered journal**

Every production Runtime MUST be able to expose or persist an ordered journal of accepted Messages and resulting transition metadata, subject to privacy policy.

**FK-FR-022: Historical effects remain inert**

Replay MUST NOT repeat historical external Commands, network writes, payments, notifications, storage mutations, or other irreversible effects.

**FK-FR-023: Live branch effects execute once**

When a user branches from historical state into a new live timeline, new effects MUST execute no more than once for the accepted branch transition.

**FK-FR-024: Replay compatibility**

Serialized journals MUST include version information and migration or refusal behavior. A runtime MUST NOT silently reinterpret an incompatible historical Message.

**FK-FR-025: Time travel and inspection**

Development tools SHOULD allow operators to inspect Model snapshots, Messages, Commands, resource state, and causality without mutating the live runtime unless an explicit validated action is taken.

**FK-FR-026: Validated machine control**

DevTools MCP or another machine-control surface MUST publish only allowed schema-defined actions. Every dispatched payload MUST be validated before it reaches update.

### 6.5 Composition and communication

**FK-FR-027: Submodels own internal interaction state**

A Submodel MUST encapsulate its Model, Message, update behavior, and optional view. Parent Programs MUST communicate through typed child-message envelopes and OutMessages rather than reaching into hidden child internals.

**FK-FR-028: OutMessages describe domain outcomes**

Child-to-parent communication SHOULD describe meaningful outcomes, not internal implementation events.

**FK-FR-029: Typed embedding**

`Runtime.embed` or its successor MUST expose Schema-typed input and output Ports and a complete `dispose` operation. The host MUST NOT read the embedded Model or dispatch arbitrary internal Messages.

**FK-FR-030: Navigation as state**

Navigation, route identity, presentation, restoration, and deep-link state SHOULD be represented in Schema-backed domain values. Parsing and route generation MUST round trip for supported routes.

### 6.6 User interface and accessibility

**FK-FR-031: Deterministic view**

A view MUST be a function of Model and explicit configuration. It MUST NOT contain authoritative local state or hidden mutation.

**FK-FR-032: Accessible components**

Published UI primitives MUST support keyboard interaction, focus management, semantic roles, labels, disabled states, reduced-motion expectations, and screen-reader use appropriate to the component.

**FK-FR-033: Interaction conformance**

Stateful components MUST expose interaction behavior through Submodels or equivalent explicit state machines. Visual adapters MUST preserve the same semantic behavior across hosts.

**FK-FR-034: Error and crash surfaces**

Applications MUST be able to render a controlled crash or recovery view and report the triggering error, Model, and Message through a redaction-aware callback.

**FK-FR-035: Slow-operation diagnostics**

Development runtimes SHOULD measure update, view, patch, subscription dependency extraction, and other declared phases against configurable budgets.

### 6.7 Testing and developer tooling

**FK-FR-036: Story tests**

The test system MUST allow update behavior to be exercised without booting a renderer. Tests MUST be able to inspect Model, Commands, OutMessages, cancellation, and failure branches.

**FK-FR-037: Scene tests**

The test system SHOULD allow real views to be rendered and driven through accessible locators without requiring a full browser for ordinary interaction tests.

**FK-FR-038: Cross-host conformance**

Portable examples MUST have a shared conformance suite that proves equivalent domain behavior across supported Clients and Processors.

**FK-FR-039: State-preserving HMR**

The Vite integration SHOULD preserve compatible Program state across view or implementation updates. Incompatible schema changes MUST migrate, reset explicitly, or fail with an actionable diagnostic.

**FK-FR-040: Scaffolding**

`create-foldkit-app` MUST generate a project that installs, builds, type checks, tests, and starts under the supported Node and pnpm versions.

### 6.8 Shared Programs and synchronization

**FK-FR-041: Accepted Message tape**

A synchronized Program MUST define which Messages are proposals, which are accepted facts, who may accept them, and how accepted ordering is established.

**FK-FR-042: Local-first proposals**

Offline-capable Clients SHOULD be able to retain proposals locally, expose their pending state, and retry without duplicating accepted effects.

**FK-FR-043: Stable identity and idempotency**

Messages, commands, runtime instances, sessions, processors, and durable artifacts that cross a process boundary MUST use stable, validated identities. Retrying the same operation MUST be idempotent or explicitly outcome-unknown.

**FK-FR-044: Conflict behavior**

Synchronization MUST define conflict, supersession, stale write, duplicate, partial commit, and reconnect behavior. Silent last-writer-wins behavior MUST NOT be used for security-sensitive or irreversible facts.

**FK-FR-045: Permission tests**

Every deployed shared schema MUST have automated permission tests proving that unauthorized users cannot read, create, update, or delete protected data.

**FK-FR-046: Offline and reconnect evidence**

Production synchronization MUST be tested under process termination, network loss, duplicated delivery, reordered delivery, reconnect, and partial persistence.

### 6.9 Wallet and high-risk examples

**FK-FR-047: Examples must not imply production safety**

Wallet, custody, transfer, staked-access, or similar examples MUST label their maturity and production limitations. Experimental code MUST NOT be presented as audited financial infrastructure.

**FK-FR-048: Secret exclusion**

Private keys, credentials, raw tokens, and recoverable secret material MUST NOT appear in Model, Message, journal, replay, view state, logs, URLs, crash reports, or machine-control surfaces.

**FK-FR-049: Custody ownership**

Custody storage MUST use an explicit validated owner partition. Local and authenticated owner constructors MUST be distinct. Cross-process ownership claims MUST be serialized where required.

**FK-FR-050: Two-phase visibility**

Sensitive generated records MUST support prepare and commit semantics so a durable record can exist without becoming visible until its exact commit succeeds. Exact retries MUST be idempotent, and conflicting bytes MUST fail closed.

**FK-FR-051: Storage key safety**

Host storage keys derived from arbitrary external identifiers MUST be bounded, canonical, and opaque. Legacy migration behavior MUST be explicit and tested.

**FK-FR-052: Normalized chain adapters**

Core wallet workflows MUST operate on normalized network, asset, account, preview, submission, and observation facts. Chain-specific encoding and provider behavior MUST remain inside adapters.

**FK-FR-053: Settlement gates**

Production settlement MUST remain disabled until the relevant contract, threat model, key management, rate limiting, relay durability, audit, governance, and regulatory decisions are complete.

## 7. Data and compatibility requirements

### 7.1 Schema evolution

- Public schemas MUST be versioned or evolvable without ambiguous interpretation.
- Removing or changing a field MUST include a migration, compatibility adapter, or documented refusal path.
- Persisted and wire representations MUST be tested against fixtures from supported prior versions.
- Closed enums MUST remain closed unless a deliberate compatibility design allows unknown cases.
- Identifiers MUST define casing, length, character set, namespace, and collision behavior.

### 7.2 Package compatibility

- Every published package MUST declare supported Node, TypeScript, Effect, renderer, and peer dependency ranges.
- Workspace examples MUST consume public package surfaces rather than unexported internals unless explicitly designated as internal conformance fixtures.
- A core API migration MUST update or intentionally quarantine all dependent examples before release.
- Generated distribution output MUST be rebuilt from the current source before tests that import package distributions.

### 7.3 Journal compatibility

- Journal entries MUST identify Program schema version, runtime version, Message type, accepted sequence, and redaction policy.
- Migration MUST be deterministic and separately testable.
- An incompatible journal MUST fail with an actionable error and MUST NOT partially replay.

## 8. Security and privacy requirements

- Trust boundaries MUST be documented for every network, storage, machine-control, wallet, authentication, and synchronization adapter.
- Authentication MUST establish identity. Authorization MUST be checked independently for each protected action.
- Capability placement MUST not weaken authorization.
- Public or remote control surfaces MUST use least privilege and explicit allowlists.
- Secrets MUST be resolved at use time through controlled dependencies and redacted from structured diagnostics.
- Sensitive operations MUST define outcome-unknown handling for failures after an irreversible boundary.
- Browser, native, terminal, and server adapters MUST validate untrusted input at entry.
- Supply-chain releases MUST include lockfile integrity, package provenance, dependency review, and reproducible build evidence appropriate to the package.
- Security-sensitive code SHOULD receive independent review and targeted adversarial tests before release.

## 9. Nonfunctional requirements

### 9.1 Correctness and determinism

- Given the same validated Model and Message, update MUST return an equivalent next state and effect description.
- Runtime Message application MUST be serialized for one authoritative instance unless a documented distributed ordering protocol applies.
- Duplicate effect completion and stale asynchronous completion MUST be covered by tests.

### 9.2 Reliability

- Runtime startup, restoration, shutdown, and resource cleanup MUST be idempotent.
- A failed Client or adapter MUST not corrupt persisted Program facts.
- Critical persistence MUST use atomic or recoverable transitions.
- Release rollback instructions MUST exist for published packages and hosted examples.

### 9.3 Performance

- Update, view, patch, subscription diffing, serialization, and replay MUST have documented benchmark scenarios and budgets.
- Performance work MUST preserve semantic equivalence.
- The runtime MUST avoid unbounded journal, subscription, listener, resource, or command retention.
- Large Program histories MUST support bounded inspection or pagination.

### 9.4 Accessibility

- Supported UI primitives MUST meet WCAG 2.2 AA expectations applicable to web components.
- Accessibility behavior MUST be tested, not inferred from visual appearance.
- Cross-renderer adapters MUST preserve semantic labels and interaction outcomes.

### 9.5 Observability

- Logs and diagnostics MUST be structured, privacy-aware, and causally attributable.
- Production failures SHOULD identify Program, runtime instance, Message type, effect or resource identity, version, and stage without including protected payloads.
- Metrics MUST have bounded cardinality.

### 9.6 Maintainability

- Public APIs MUST have documentation and runnable examples.
- Architecture rules SHOULD be enforced through linting, types, and tests before relying on review convention.
- Dead code and circular dependencies MUST be checked in CI.
- Architectural decisions with durable consequences MUST use an ADR.

### 9.7 Portability

- Core Program modules MUST not import renderer, DOM, native, terminal, provider, or transport implementations.
- Host adapters MUST be replaceable through typed boundaries.
- Platform-specific behavior MUST be represented as explicit capabilities or policies.

## 10. Build, test, and release requirements

A release candidate MUST satisfy all of the following:

1. The working tree is clean and attributable to a reviewed commit.
2. The release branch is reconciled with its intended base and remote.
3. The pinned Node and pnpm versions are used.
4. Formatting, lint, dead-code, circular-dependency, package build, and type-check gates pass.
5. Unit, Story, Scene, integration, smoke, and website E2E suites pass with documented intentional skips.
6. Every changed public package has an accurate Changeset.
7. Cross-example API migrations are complete.
8. Package tarballs are inspected for expected files and excluded private artifacts.
9. The create-app smoke project installs, builds, tests, and starts.
10. Security-sensitive changes receive targeted threat-model and failure-path review.
11. npm publication uses trusted publishing and provenance.
12. Release notes identify breaking changes, migrations, experimental surfaces, and known limitations.
13. A rollback or follow-up release procedure is documented.

## 11. Production-readiness acceptance

Foldkit is ready for a stable 1.0 declaration only when:

- The Program, Runtime, Command, Subscription, Managed Resource, Submodel, Port, journal, and replay contracts are documented and compatibility-tested.
- View-agnostic execution is supported as a public contract, not only a repository prototype.
- At least three materially different Clients pass one shared Program conformance suite.
- Replay semantics cover effect suppression, branch-to-live execution, migration, cancellation, and resource lifecycle.
- Shared Program synchronization has a documented admission, ordering, idempotency, permission, and reconnect model.
- Public package ownership, semver policy, deprecation window, security policy, and support policy are published.
- All official examples compile against the released API.
- Accessibility and performance baselines are enforced in CI.
- There are no known P0 or P1 correctness, security, data-loss, or release-process defects.
- One or more external applications have completed production pilots without framework forks.

Wallet or settlement functionality has a separate production gate and MUST NOT inherit a 1.0 framework label as evidence of financial safety.

## 12. Current known gaps and release blockers

As of the document date, the following gaps are confirmed:

- The active development branch has not been integrated into `origin/main` and is 211 commits ahead.
- The working tree contains large uncommitted wallet-storage changes.
- `pnpm check` fails because the staked-access example still targets older wallet APIs.
- A React Native showcase test suite fails at import because a wallet owner/storage record is rejected as invalid.
- Several ADRs remain proposed or exploratory rather than finalized public contracts.
- The generic Sharing API and final public React adapter lifecycle remain open design areas in the view-agnostic runtime work.
- Production wallet relay, timing-safe verification, Expo cryptography, durable authenticated transport, rate limiting, deployment permissions, and independent security review remain incomplete.
- Eleven pending Changesets require reconciliation with the intended release boundary.
- Branch and worktree activity indicates multiple overlapping lines of wallet work that require explicit ownership and integration.

These gaps are converted into sequenced work in `gpt-pro-suggested-next-tasks.md`.

## 13. Traceability

This specification should be maintained alongside:

- `README.md` for the public framework overview.
- `packages/website/src/page/manifesto.ts` for the public architecture argument.
- `docs/adr/0001-view-agnostic-runtime-prototype.md`.
- `docs/adr/0002-universal-program-replay.md`.
- `docs/adr/0003-navigation-as-state.md`.
- `docs/adr/0004-portable-wallet-and-staked-access.md`.
- `docs/adr/0005-normalized-wallet-chain-adapters.md`.
- Package changelogs and Changesets for shipped behavior.
- `CONSTITUTION.md` for non-negotiable engineering rules.
- `PRD.md` for product positioning and outcome priorities.

Any implementation that intentionally deviates from a MUST requirement requires an ADR or an explicit amendment to this document before release.
