# ADR 0004 | Synchronized Program Session Modes

Date: 2026-07-31

Status: Accepted for staged implementation

## Context

An authenticated Foldkit Program can run on several Processors at once. The
Processors consume one globally ordered accepted Message history, render through
different Clients, and execute Commands according to their capabilities.

Sharing a Program does not imply one fixed navigation experience. The first
Instant Counter proof needs every device to move together. Ordinary applications
usually need shared domain state with independent navigation. A third case lets
selected devices follow one leader, with remote control available only through an
explicit authorization grant.

InstantDB is the storage and transport adapter. It must not decide whether a
Message is domain behavior or navigation, who may delete a counter, or which
Processors should apply an accepted occurrence.

## Decision

Foldkit defines three Schema-backed synchronization modes:

```text
Mode
  Mirror
  SharedDomain
  Follow(leaderProcessorId, followers)

Follower
  Observe
  RemoteControl
```

Every Program that supports SharedDomain or Follow provides an exhaustive
Message classifier beside Model, Message, init, and update:

```text
MessageCategory
  Domain
  Navigation
```

Modal, dialog, sheet, and alert state are Navigation when they describe the
semantic destination visible in the Program Model. A Client may render that state
as a browser dialog, an iOS sheet, an Android dialog, or a terminal prompt. The
rendering surface is not synchronized state.

The session policy resolves each accepted Message to an immutable audience:

| Mode         | Domain Message | Navigation Message                 |
| ------------ | -------------- | ---------------------------------- |
| Mirror       | Entire session | Entire session                     |
| SharedDomain | Entire session | Originating Processor              |
| Follow       | Entire session | Leader and the frozen follower set |

Processors outside an occurrence's audience still advance the one global
accepted sequence. They skip update for that occurrence. Instant queries are never
filtered by audience because filtered history would create sequence gaps.

Follow is observe-only by default. An observing follower cannot originate followed
Navigation Messages. A follower may drive the followed group only when the policy
contains an explicit RemoteControl grant. The originating Processor performs a
local preflight for immediate feedback, and the admission sequencer independently
recomputes the decision before acceptance.

Each accepted occurrence records its resolved audience and policy generation.
Changing a Follow graph never changes an older occurrence's recipients. Starting
Follow initially synchronizes the next accepted Navigation Message. Immediate
alignment with the leader's current destination requires a fresh typed Navigation
Message derived from the leader's current Program state.

## Authority

Authority remains separated:

1. Authentication establishes the subject.
2. Instant permissions determine whether that subject may read records or create a
   raw proposal.
3. The session-designated admission sequencer validates scope, provenance, Schema,
   duplicates, policy, and ordering, then freezes the audience and accepted
   sequence.
4. Program update determines what an admitted Message means.
5. Account and domain authorization determine whether the actor may perform a
   protected domain action such as deleting a counter.

The admission sequencer is not automatically the business authority. A stale but
well-formed Message can remain in the audit history and reduce to an unchanged
Model. A malformed, forged, unauthorized, or policy-invalid proposal never reaches
update.

## Program Laws

A synchronized Program must satisfy two laws:

1. Given equal domain projections and arbitrary navigation states, applying the
   same Domain Message produces equal next domain projections.
2. Applying a Navigation Message leaves the domain projection unchanged.

Multiple Counters therefore carries an explicit counter identity in confirmed
deletion. Every Processor removes that counter from shared domain state. Only a
Processor currently viewing the removed counter normalizes its own navigation.

A Program without a Message classifier may run only in Mirror for compatibility.
Allocating SharedDomain or Follow without the classifier fails before proposal
processing. There is no silent fallback.

## Effects, Replay, and Checkpoints

A Command result inherits the causative occurrence's audience and policy
generation. The Processor that happens to execute the Command does not choose the
result audience.

Replay preserves the accepted envelope and its frozen audience. A Processor's
local replay frames may omit accepted occurrences that were outside its audience,
while the global accepted sequence remains continuous.

Full-Model checkpoints are Processor projections once navigation can differ. Their
projection identity includes the Processor attachment and policy. A new
SharedDomain Processor must not restore another Processor's navigation.

## URI and Client Boundary

The Program owns portable destination URIs. The Client owns only the carrier, such
as a browser origin, an Expo scheme, or a terminal argument. Synchronization mode,
credentials, Processor capabilities, raw keys, and transport provenance do not
enter the URI.

Semantic interaction identities belong to the source Program or Submodel
archetype. The composed destination URI identifies the subgraph whose current Model
derives the valid interaction set. Raw keyboard, pointer, touch, and hardware input
remain Client input.

The adjacent draft at
`/Users/laptop/Sync/wiki/drafts/emoji-ids-canonical-acess.md` contains related
non-canonical thinking about URI-addressed interaction graphs. Foldkit does not
adopt that draft's Action, reducer, or tape terminology as framework canon.

## Staged Proof

1. Mirror makes the current implicit behavior explicit and proves synchronized
   list, detail, fact, delete confirmation, optimism, replay, and reconnect across
   native host presentations.
2. SharedDomain makes domain synchronization the default while keeping navigation
   Processor-specific and Program-owned.
3. Follow adds durable leader and follower policy, observe-only behavior, explicit
   RemoteControl grants, detachment, and typed catch-up navigation.

The existing local Multiple Counters OpenTUI Client is not an authenticated Instant
Client. An Instant-authenticated OpenTUI adapter remains a separate acceptance lane.
