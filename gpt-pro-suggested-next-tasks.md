# GPT Pro Suggested Next Tasks | Foldkit

**Prepared:** July 30, 2026

**Purpose:** Convert the current Foldkit repository into a clean, reviewable, production-ready release sequence

**Scope:** Framework packages, official examples, tooling, documentation, shared Program experiments, and wallet reference implementations

## Current status snapshot

Foldkit is architecturally mature but not currently in a release-candidate state.

- Active branch: `ml/exploring-view-agnosticism`.
- Remote divergence: 211 commits ahead of `origin/main`, 0 behind.
- Working tree: 21 modified wallet and client files, approximately 3,474 insertions and 402 deletions.
- Repository size: approximately 4,989 tracked files, 3,352 TypeScript or JavaScript files, 692 test files, and 822 Markdown or MDX files.
- Pending release intent: 11 Changesets.
- Focused wallet verification observed: 131 passing tests and 5 skipped tests.
- Confirmed failing release gates:
  - `examples/staked-access/core` still consumes wallet APIs and schema fields removed or renamed by the normalized wallet migration.
  - A React Native showcase wallet suite fails during module import with `WalletVaultStorageError: InvalidRecord`.
- Important incomplete production work:
  - Public convergence of the view-agnostic Runtime and Client lifecycle.
  - Generic Sharing and public React adapter decisions.
  - Durable authenticated wallet transfer relay.
  - Production cryptography adapters and timing-safe comparison.
  - Rate limiting, permissions, host wiring, and independent security review.

The immediate objective is not to add another major capability. It is to converge the existing work into a clean, attributable, fully green release candidate.

## Execution rules

- [ ] Preserve every existing uncommitted change before editing related files.
- [ ] Coordinate with owners of `codex/wallet-creation`, `codex/wallet-multichain-send`, and any active worktree before reconciling overlapping wallet work.
- [ ] Do not reset, stash, or overwrite another contributor's work.
- [ ] Use the repository-pinned Node and pnpm versions for every release claim.
- [ ] Keep public framework release readiness separate from wallet production safety.
- [ ] Treat examples as release gates when they are part of the official workspace.
- [ ] Do not declare a failure unrelated. Fix it, quarantine it through an explicit release-scope decision, or remove the broken surface.
- [ ] Use focused tests while changing code, then run the complete required matrix from a clean commit.
- [ ] Add or update Changesets only after the public release boundary is understood.

## P0 | Preserve and reconcile the active work

### FK-NEXT-001 | Establish ownership and a safe integration baseline

- [ ] Record the current branch, HEAD, upstream, worktree list, and modified paths.
- [ ] Identify which modified files belong to the current wallet custody increment and which overlap another worktree.
- [ ] Compare the current wallet diff with `codex/wallet-creation` and `codex/wallet-multichain-send` without modifying either worktree.
- [ ] Decide the canonical integration branch for the release candidate.
- [ ] Document whether the 211 commits ahead of `origin/main` are intended for one release, several releases, or an internal consolidation branch.
- [ ] Push or otherwise preserve all reviewed commits in an appropriate remote branch before high-risk integration.

**Acceptance evidence**

- A written branch and ownership map.
- No lost or silently overwritten work.
- Every modified path has an identified owner and intended commit.
- The chosen release base and integration direction are explicit.

### FK-NEXT-002 | Converge the wallet storage transaction

The current working diff introduces owner partitions, prepare and commit visibility, process-local and cross-process custody guarantees, hashed storage keys, legacy compatibility, subset-network custody, Keychain locking, and Expo or web storage changes.

- [ ] Review the complete wallet storage diff as one transaction rather than file by file.
- [ ] Confirm the exact invariants for `prepareRecord` and `commitPreparedRecord`.
- [ ] Confirm idempotency for exact retries and conflict behavior for different bytes.
- [ ] Confirm owner-key validation and separate local versus authenticated constructors.
- [ ] Confirm Keychain cross-process serialization and lock cleanup on crash, timeout, cancellation, and process termination.
- [ ] Confirm Expo and web adapters state their weaker process-local guarantee explicitly.
- [ ] Confirm legacy v1 records remain readable without exposing unsafe raw keys to new writes.
- [ ] Confirm subset-network records do not require keys for unrequested chains.
- [ ] Add one migration matrix covering memory, Keychain, Expo SecureStore, and web storage.
- [ ] Commit the coherent storage increment only after its focused suite is green.

**Acceptance evidence**

- Storage contract documentation.
- Focused adapter tests for prepare, commit, retry, conflict, orphan recovery, owner isolation, and migration.
- An opt-in native Keychain restart and concurrent-process result on macOS.
- No private key or raw record content in test output or logs.

## P0 | Restore all release gates

### FK-NEXT-003 | Repair normalized wallet compatibility in staked-access

- [ ] Reproduce the complete `examples/staked-access/core` type-check failure under the pinned toolchain.
- [ ] Map every missing type, renamed field, and changed schema to the normalized wallet contract in ADR 0005.
- [ ] Decide whether staked-access should consume the current public wallet contract, a deliberately versioned adapter, or an experimental internal interface.
- [ ] Update the entire example, not only the first reported compiler error.
- [ ] Add or update fixtures proving route, Model, Message, preview, account, asset, and network compatibility.
- [ ] Remove obsolete compatibility code after all consumers migrate.
- [ ] Run the staked-access build, type check, focused tests, and any browser or Scene checks.

**Acceptance evidence**

- `examples/staked-access/core` type checks against the current wallet API.
- No references remain to retired wallet fields or types.
- The example's security and production limitations remain explicit.

### FK-NEXT-004 | Fix the React Native owner-partition import failure

- [ ] Isolate the first module that constructs an invalid owner key or storage record.
- [ ] Verify whether the failure is a malformed fixture, incorrect constructor, import-time side effect, stale built distribution, or incompatible legacy record.
- [ ] Ensure tests do not create authenticated custody from arbitrary strings.
- [ ] Move runtime setup out of module import when import-time construction is not required.
- [ ] Add a regression proving the module can import before secure storage is configured.
- [ ] Add focused tests for valid local ownership, valid authenticated ownership, and malformed ownership.
- [ ] Rebuild package distributions before running tests that import built output.

**Acceptance evidence**

- The previously failing React Native suite imports and runs successfully.
- Invalid owner keys still fail closed through a typed error.
- No test relies on an accidental permissive constructor.

### FK-NEXT-005 | Eliminate unexplained skips in the changed area

- [ ] List the 5 observed skipped wallet tests with their exact reason and owner.
- [ ] Run every skip that is supported on the current Mac.
- [ ] Separate unavoidable platform integration tests from unfinished behavior.
- [ ] Add an explicit environment flag and safety instructions for tests that touch real Keychain or external services.
- [ ] Fail CI when a formerly required test becomes skipped unexpectedly.

**Acceptance evidence**

- Every skip is intentional, documented, and represented in the release report.
- No skip conceals a required production invariant.

### FK-NEXT-006 | Run the complete static and test matrix

Run from a clean, reviewed commit after the focused fixes.

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm check:no-claude-comments`
- [ ] `pnpm format:check`
- [ ] `pnpm check:changeset-ignore`
- [ ] `pnpm lint`
- [ ] `pnpm check:dead-code`
- [ ] `pnpm check:circular-deps`
- [ ] `pnpm -r --filter './packages/**' build`
- [ ] `pnpm -r typecheck`
- [ ] `pnpm check:create-foldkit-app-smoke`
- [ ] `pnpm test`
- [ ] Install the supported Playwright browser.
- [ ] Run `pnpm --filter website test:e2e`.
- [ ] Run any opt-in native or external integration checks required by changed packages.

**Acceptance evidence**

- One captured command matrix from one clean commit.
- Zero unexplained failures, flakes, or required skips.
- Exact toolchain versions and commit SHA recorded.

## P0 | Define the release boundary

### FK-NEXT-007 | Audit all pending Changesets

- [ ] List all 11 Changesets and the packages they affect.
- [ ] Match each Changeset to an implemented, tested public change.
- [ ] Remove or rewrite stale summaries that describe abandoned designs.
- [ ] Ensure pre-1.0 breaking changes use the intended semver policy.
- [ ] Separate framework, Instant, React, UI, wallet, and example-only changes.
- [ ] Confirm no package receives a release bump only because a source alias changed internally.
- [ ] Add missing migration notes for renamed schemas, owner partitions, Runtime surfaces, and replay behavior.

**Acceptance evidence**

- `pnpm changeset status` describes the intended release accurately.
- Every released package has a clear reason and migration story.

### FK-NEXT-008 | Classify packages by maturity

Create and publish a maturity table with these categories:

- Stable public contract.
- Supported pre-1.0 contract.
- Experimental public package.
- Internal proof or example.
- Security-sensitive prototype.
- Not for production use.

- [ ] Classify the core `foldkit` package and each published companion package.
- [ ] Classify Instant shared Program packages.
- [ ] Classify React and React Native adapters.
- [ ] Classify wallet QR, local-vault, live-client, and vault-transfer packages.
- [ ] Make maturity visible in package README files and generated documentation.
- [ ] Prevent examples from implying stronger guarantees than their underlying package.

**Acceptance evidence**

- A user can tell what is supported without reading repository history.
- Wallet transfer and settlement surfaces are not mistaken for audited production custody.

### FK-NEXT-009 | Inspect publish artifacts

- [ ] Produce package tarballs from a clean commit without publishing.
- [ ] Inspect exports, declarations, source maps, README files, licenses, and package metadata.
- [ ] Confirm no credentials, local paths, fixtures with secrets, test artifacts, screenshots, or internal-only modules are included.
- [ ] Install the tarballs into independent smoke projects.
- [ ] Run an ESM and supported bundler import smoke test.
- [ ] Run `create-foldkit-app` against the release-candidate packages where practical.

**Acceptance evidence**

- A package artifact inventory attached to the release candidate.
- Independent install, type-check, build, and runtime smoke results.

## P1 | Finalize the portable Program Runtime

### FK-NEXT-010 | Ratify the Program and Runtime public contract

- [ ] Resolve the remaining open questions in ADR 0001.
- [ ] Define the final ownership relationship among Program, Runtime instance, Client, and Processor.
- [ ] Define startup, observation, dispatch, journal access, replay, branch, shutdown, and disposal semantics.
- [ ] Define behavior for zero Clients, multiple Clients, Client replacement, and headless execution.
- [ ] Define whether and how a Program may provide optional views without coupling execution to them.
- [ ] Remove prototype-only aliases that expose two lifecycle models.
- [ ] Add API compatibility fixtures and public TSDoc.

**Acceptance evidence**

- ADR 0001 is finalized or superseded.
- The public API is demonstrated by at least one browser Client, one React Client, and one nonvisual Client.
- Equivalent domain tests pass across all three.

### FK-NEXT-011 | Finalize the public React adapter

- [ ] Define one supported adapter lifecycle.
- [ ] Verify React Strict Mode double-mount behavior.
- [ ] Verify subscription cleanup and no post-unmount updates.
- [ ] Verify server-rendering and hydration behavior or explicitly declare them unsupported for the first release.
- [ ] Verify error propagation and crash reporting.
- [ ] Verify multiple embedded Runtime instances.
- [ ] Publish a minimal integration example that does not duplicate Program state in hooks.

**Acceptance evidence**

- One documented public adapter surface.
- Strict Mode, unmount, and duplicate-subscription regressions covered.

### FK-NEXT-012 | Resolve generic Sharing and external state integration

- [ ] Define the exact problem the generic Sharing API solves beyond Ports, Subscriptions, and synchronized Programs.
- [ ] Compare alternatives through two materially different domains.
- [ ] Specify ownership, write authority, conflict, observation, replay, migration, and disposal behavior.
- [ ] Reject any design that creates a second authoritative store beside Model.
- [ ] Record the decision in an ADR before public export.

**Acceptance evidence**

- Either a reviewed public contract with conformance tests or a documented decision not to add a new primitive.

### FK-NEXT-013 | Complete navigation-as-state review

- [ ] Reconcile ADR 0003's proposed status with its existing implementation evidence.
- [ ] Define supported route, modal, sheet, split-view, tab, window, and deep-link vocabulary for the next release.
- [ ] Define generic carrier responsibilities without coupling the Program to browser history.
- [ ] Define cross-Client and linked-timeline behavior as supported, experimental, or deferred.
- [ ] Add restoration and incompatible-route migration fixtures.

**Acceptance evidence**

- ADR status matches the actual public commitment.
- Supported navigation carriers pass round-trip and restoration tests.

## P1 | Harden journal, replay, and DevTools

### FK-NEXT-014 | Version the journal contract

- [ ] Specify the serialized journal envelope and Program schema version.
- [ ] Define Message migration, refusal, and partial-artifact behavior.
- [ ] Add fixtures from supported prior versions.
- [ ] Define redaction, pagination, retention, and export limits.
- [ ] Prove that unsupported journals fail before partial replay.

### FK-NEXT-015 | Prove replay safety across effect classes

- [ ] Cover Commands, Subscriptions, Mount, ManagedResources, navigation carriers, shared Program effects, and wallet effects.
- [ ] Prove historical effects remain inert.
- [ ] Prove one new live branch executes new effects once.
- [ ] Prove stale completion from the abandoned live timeline cannot reach the branch.
- [ ] Add negative tests for signing, settlement, publication, notifications, and storage writes.

### FK-NEXT-016 | Bound DevTools and MCP control surfaces

- [ ] Separate read-only inspection from Message dispatch capability.
- [ ] Require explicit enablement for remote control.
- [ ] Confirm schema allowlists and payload limits.
- [ ] Redact secrets and high-cardinality private data before exposure.
- [ ] Add authorization and abuse tests for network-accessible configurations.
- [ ] Document a safe production posture, including when DevTools MCP must be absent.

## P1 | Productionize shared Programs and Processors

### FK-NEXT-017 | Finalize admission and accepted Message ordering

- [ ] Define proposal, acceptance, rejection, sequence, cursor, and authority-rotation contracts.
- [ ] Prove stale authority cannot accept after rotation.
- [ ] Prove duplicate and reordered proposals do not duplicate accepted effects.
- [ ] Prove cursor advancement occurs only after successful application.
- [ ] Add schema migration and malformed-peer isolation tests.

### FK-NEXT-018 | Finalize Processor capability placement

- [ ] Define capability identity, version, affinity, cardinality, availability, and unavailable behavior.
- [ ] Keep authentication and admission separate from executor placement.
- [ ] Add placement-generation and revocation tests.
- [ ] Add failure recovery when a selected Processor disappears mid-command.
- [ ] Publish operational diagnostics for placement decisions.

### FK-NEXT-019 | Harden local-first operation

- [ ] Persist offline proposals and pending state durably.
- [ ] Test process termination between local enqueue and remote acceptance.
- [ ] Test duplicate delivery, reconnect, stale snapshots, and partial commit.
- [ ] Define bounded outbox and compaction policy.
- [ ] Add permission tests for every deployed Instant namespace.
- [ ] Add an operator recovery procedure for stuck or outcome-unknown work.

### FK-NEXT-020 | Operationalize artifact streams

- [ ] Define ownership, authorization, resumability, offset validation, lifetime, and deletion.
- [ ] Bound artifact size and concurrent streams.
- [ ] Verify interrupted upload and download recovery.
- [ ] Keep artifact references in Messages while large bytes remain outside replay payloads.

## P1 | Complete wallet security gates

### FK-NEXT-021 | Write and review a wallet threat model

Cover:

- local custody;
- authenticated owner partitions;
- browser, Expo, Keychain, and server storage;
- QR receiving instructions;
- vault transfer ticket, verifier, relay, claim, acknowledgement, and cancellation;
- live chain providers and settlement;
- replay and DevTools exposure;
- logs, crash reports, and package artifacts.

- [ ] Identify assets, attackers, trust boundaries, abuse cases, and residual risks.
- [ ] Map every mitigation to a test or operational control.
- [ ] Obtain independent security review before enabling real credential transfer as a supported feature.

### FK-NEXT-022 | Replace development cryptography and comparison seams

- [ ] Use production platform cryptography adapters for browser, Node, and Expo.
- [ ] Provide host-supplied timing-safe verifier comparison, including dummy work for unavailable states.
- [ ] Validate algorithm, nonce, tag, key, and payload bounds at adapter boundaries.
- [ ] Wipe plaintext and intermediate secret bytes on every exit path where the platform permits it.
- [ ] Add known-answer, tamper, truncation, wrong-owner, wrong-ticket, and cancellation tests.

### FK-NEXT-023 | Build a durable authenticated relay

- [ ] Authenticate principals independently from ticket possession.
- [ ] Keep principal bindings server-side and unlinkable where practical.
- [ ] Persist reservations, capsules, claims, acknowledgement, cancellation, and purge state.
- [ ] Define exactly one winner and retry-safe acknowledgement.
- [ ] Add expiration cleanup, payload and lifetime limits, rate limiting, and abuse controls.
- [ ] Test process crash at every state transition.
- [ ] Define outcome-unknown behavior for relay or network failure.

### FK-NEXT-024 | Complete host wiring and custody acceptance

- [ ] Wire browser, Expo, terminal, React Native, and native Mac hosts through the reviewed owner and storage constructors.
- [ ] Prove no Client bypasses the normalized record port.
- [ ] Prove records survive supported process restarts.
- [ ] Prove two processes cannot create conflicting custody for one owner and wallet request.
- [ ] Verify legacy migration on representative real records using sanitized copies.

### FK-NEXT-025 | Keep settlement gated

- [ ] Require explicit per-network production configuration.
- [ ] Add balance, fee, simulation, slippage, nonce, chain identity, and finality policies.
- [ ] Add provider failover and rate-limit behavior.
- [ ] Add testnet physical acceptance for every claimed network and Client.
- [ ] Document that a framework release does not certify wallet or settlement safety.

## P1 | Release engineering and supply chain

### FK-NEXT-026 | Pin and verify the development toolchain

- [ ] Confirm `packageManager`, Corepack, CI pnpm, and local pnpm agree.
- [ ] Confirm the supported Node version locally and in CI.
- [ ] Make version mismatch fail early with an actionable message.
- [ ] Test a clean clone with no preexisting global pnpm assumptions.

### FK-NEXT-027 | Add release-candidate workflow

- [ ] Create a workflow that runs all release gates against the exact candidate commit.
- [ ] Upload test, package, benchmark, accessibility, and provenance summaries.
- [ ] Add package-tarball smoke installation.
- [ ] Add Changeset and migration validation.
- [ ] Require the workflow before the release job may publish.

### FK-NEXT-028 | Establish rollback and support procedures

- [ ] Document npm deprecation and corrective release steps.
- [ ] Document how to reproduce a user report from version, journal, and package metadata.
- [ ] Define supported pre-1.0 versions and response expectations.
- [ ] Publish a security contact and vulnerability reporting policy.

## P2 | Performance, accessibility, and quality baselines

### FK-NEXT-029 | Establish representative performance budgets

Measure at least:

- small and large update transitions;
- keyed list rendering;
- virtual DOM patching;
- subscription dependency extraction;
- Runtime observation fan-out;
- journal append and replay;
- DevTools history inspection;
- React and React Native adapter updates;
- terminal rendering;
- shared Program reconnect.

- [ ] Define budgets and regression thresholds.
- [ ] Run benchmarks on stable CI hardware or use statistically defensible comparison.
- [ ] Add soak tests for unbounded listener, journal, and resource retention.

### FK-NEXT-030 | Complete UI accessibility conformance

- [ ] Inventory every published UI primitive.
- [ ] Verify keyboard navigation, focus entry and return, role, name, state, disabled behavior, dismissal, reduced motion, and high contrast where applicable.
- [ ] Add automated accessibility checks and manual screen-reader scripts.
- [ ] Ensure component Submodels remain the source of interaction state.
- [ ] Publish known platform differences.

### FK-NEXT-031 | Create a cross-Client conformance kit

- [ ] Extract reusable Program fixtures for Counter, navigation, resources, replay, and one complex domain.
- [ ] Run the same transition and lifecycle expectations against Foldkit, React, React Native, CLI, TUI, and headless Clients where supported.
- [ ] Report unsupported capabilities explicitly rather than silently skipping.
- [ ] Make conformance available to third-party Client authors.

## P2 | Documentation and adoption

### FK-NEXT-032 | Build a progressive learning path

- [ ] Explain Model, Message, update, Command, and Story first.
- [ ] Introduce Subscriptions, Mount, ManagedResources, and Submodels through lifecycle problems.
- [ ] Introduce Ports, embedding, replay, and multiple Clients after the core architecture.
- [ ] Add migration guides for React-oriented users without suggesting hidden local state inside a Program.
- [ ] Include failure examples, not only happy paths.

### FK-NEXT-033 | Publish the architecture evidence map

- [ ] Map each major product claim to its package, example, tests, ADR, and maturity.
- [ ] Distinguish implemented, verified, experimental, and production-ready.
- [ ] Link replay, navigation, shared Program, wallet, accessibility, and performance evidence.
- [ ] Keep the map generated or checked so it does not drift silently.

### FK-NEXT-034 | Run external production pilots

- [ ] Select at least two non-wallet applications with different interaction and lifecycle needs.
- [ ] Require one application to use multiple Clients or embedding.
- [ ] Collect upgrade, debugging, replay, accessibility, and operational findings.
- [ ] Do not stabilize 1.0 APIs until pilot feedback is reconciled.

## Suggested execution order

1. `FK-NEXT-001` Establish ownership and integration baseline.
2. `FK-NEXT-002` Converge the wallet storage transaction.
3. `FK-NEXT-003` Repair staked-access compatibility.
4. `FK-NEXT-004` Fix the React Native import failure.
5. `FK-NEXT-005` Explain or eliminate skips.
6. `FK-NEXT-006` Restore the complete green matrix.
7. `FK-NEXT-007` and `FK-NEXT-008` define release intent and maturity.
8. `FK-NEXT-009` inspect real package artifacts.
9. Ship a converged pre-1.0 release.
10. Finalize portable Runtime work in `FK-NEXT-010` through `FK-NEXT-016`.
11. Productionize shared Programs in `FK-NEXT-017` through `FK-NEXT-020`.
12. Keep wallet security work on its independent gate in `FK-NEXT-021` through `FK-NEXT-025`.
13. Complete supply-chain, quality, documentation, and pilot work before 1.0.

## Release-candidate exit criteria

A pre-1.0 Foldkit release candidate is ready only when all are true:

- [ ] The candidate commit is clean, reviewed, and preserved remotely.
- [ ] Branch ownership and integration are resolved.
- [ ] The full pinned-toolchain CI matrix passes.
- [ ] Staked-access and React Native wallet regressions are fixed.
- [ ] All required skips are justified.
- [ ] Changesets match the actual public diff.
- [ ] Package artifacts pass independent installation smoke tests.
- [ ] Maturity labels prevent experimental or security-sensitive work from being overclaimed.
- [ ] Migration notes exist for every public breaking change.
- [ ] Release provenance and rollback procedure are verified.

## Foldkit 1.0 exit criteria

Foldkit 1.0 should not be declared until all are true:

- [ ] The Program and portable Runtime contracts are stable and compatibility-tested.
- [ ] Journal and replay formats are versioned with migration fixtures.
- [ ] At least three Clients pass shared conformance.
- [ ] The public React adapter has a complete lifecycle contract.
- [ ] Navigation-as-state has a finalized supported vocabulary.
- [ ] Accessibility and performance baselines are enforced.
- [ ] Shared Program behavior is either productionized or clearly outside the 1.0 support boundary.
- [ ] Security policy, support policy, deprecation policy, and maintainer ownership are public.
- [ ] External pilots have shipped without architecture forks.
- [ ] There are no unresolved P0 or P1 framework correctness, security, data-loss, or release-process defects.

## Explicitly separate wallet production readiness

A Foldkit framework release does not make the wallet examples safe for real funds. Real credential transfer, custody, or settlement remains blocked until:

- [ ] independent threat-model review is complete;
- [ ] production cryptography adapters are in place;
- [ ] the authenticated relay is durable and rate-limited;
- [ ] owner and custody semantics are proven across process restarts;
- [ ] permissions and operational recovery are tested;
- [ ] all supported networks have physical testnet evidence;
- [ ] legal and regulatory scope is understood;
- [ ] and an explicit security release decision is recorded.

## Progress reporting format

Update this file by marking a task complete only when its acceptance evidence exists. For each completed task, record:

- commit SHA;
- exact commands and result;
- affected packages and examples;
- migration or compatibility impact;
- remaining limitations;
- and the next unblocked task.

Do not convert partial implementation into a checked task. Use a note such as `In progress`, `Blocked`, or `Verification needed` until the complete acceptance boundary is satisfied.
