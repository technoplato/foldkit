# Project Cardboard | Rule Zero

Project Cardboard is a portable accessibility and presentation system. One
Program owns meaning, state, Messages, replay, and portable routes. Each client
expresses that Program through the capabilities of its medium.

## Engagement rule

Rule Omega begins from a positive mutual expectation: interpret an idea as an
attempt to create value, extend the useful part, and flag a contradiction only
when it materially changes safety, evidence, consent, privacy, or
implementation. A flag names the conflicting claims and proposes a
construction that preserves their intended values. Each exchange respects the
speaker's explicit question budget.

## Immediate consistency decisions

1. `/0` is the public, portable Cardboard root and displays the value `4`.
   Activating `4` advances to `/0/5`, then `/0/6`, without a terminal state.
   Any conforming host may serve the portable route through its own scheme and
   authority. Private state and consequential actions still require explicit,
   scoped authority.
2. Repeated use cannot prove that software contains no malicious behavior.
   Cardboard can instead provide reproducible builds, signed provenance,
   declared capabilities, resource budgets, deterministic replay, sandboxed
   execution, and public evidence of the behavior actually exercised.
3. A hash cannot make a market cycle repeatable. A point can carry an exact
   timestamped stake, while a separately versioned market reference defines
   its unit of account. Claims about predictability require observed evidence.
4. A Message is data, not executable authority. A host validates its Schema,
   Program version, signature, declared intent, capabilities, and resource
   budget before choosing whether to execute the corresponding verified build.

## Declaration

Software should help people perceive information, coordinate voluntarily,
understand consequences, and repair mistakes. A person's information should
remain portable across presentation media without surrendering meaning,
privacy, or agency to any renderer, platform, institution, or vendor.

Cardboard exists to make the same Program available through sight, sound,
touch, text, speech, assistive technology, radio, automation, and future media.
It treats accessibility as a property of the complete information path, not a
special mode attached to one screen.

## Constitution

1. **One Program.** Model, Message, update, Commands, Subscriptions, replay,
   and portable routes remain independent of any presentation medium.
2. **Facts enter as Messages.** Messages describe events that occurred.
   Commands describe finite work requested by update.
3. **The Model is authoritative.** Hosts render and translate native input.
   They do not create a competing source of truth.
4. **Access is explicit.** Public routes reveal public state. Private state is
   shared only through an explicit, scoped, revocable capability.
5. **Claims carry evidence.** A claim identifies its source, meaning, time,
   confidence, evidence, and optional stake. Payment is evidence of transferred
   value, not automatic proof of truth.
6. **Accessibility is multimodal.** No essential meaning or operation depends
   only on color, sight, hearing, speech, dexterity, memory, or speed.
7. **Private execution is bounded.** Software declares and receives only the
   capabilities and resources required for its stated purpose.
8. **Due process is represented.** Notice, evidence, response, decision,
   remedy, appeal, expiry, and reversal are explicit states with replayable
   transitions.
9. **Rules expire unless justified.** Every adopted rule has an owner,
   rationale, test, review date, and removal path.
10. **Security claims stay scoped.** Evidence says exactly which source,
    artifact, capabilities, inputs, and executions were inspected.
11. **Rule Zero displays four.** `/0` contains one semantic Cardboard button
    labeled `4`. Activating it records `AdvancedCardboardSequence` and derives
    the next natural value. The Model stores only the current value, never an
    infinite collection.
12. **Context is volunteered evidence.** A client may attach a sampled screen,
    route, timestamp, source, reason, and retention period so another person or
    agent can understand what was being discussed. Capture is visible,
    consented, bounded, revocable, and never presumed to be continuous hidden
    surveillance.
13. **Flourishing is measured without prescribing a household.** Cardboard may
    measure how many hours people must work to survive, thrive, and support the
    people they love. Membership does not require one family structure. Rules
    remain versioned, challengeable, and forkable.
14. **Computation has a visible budget.** A host exposes material compute,
    network, storage, energy, and paid-service costs before or while they are
    incurred. A participant can set limits, cancel work, and inspect which
    Program intent consumed the budget.
15. **Play remains voluntary.** A riddle may invite exploration, but it never
    hides a consequential permission, charge, or data grant. Skipping remains
    explicit, available, and represented in the replayable Model.
16. **An autograph is not a blank check.** Automatic signing is allowed only
    through an explicit client policy scoped by Program, Message Schema,
    recipient, amount, total budget, expiry, and revocation. A signed Message
    proves its bytes and signer. It does not authorize a relay to take unrelated
    funds.
17. **Continuity is volunteered.** Reinstallation continuity uses an explicit
    client-held recovery key or transferable receipt. Cardboard does not hide
    device fingerprints in timing, network location, Morse code, or another
    covert channel.

## Bill of Rights

Every participant has the right to:

- perceive the same essential information through a usable medium;
- choose, inspect, export, and change their presentation profile;
- know which Program, build, resources, and rules produced a result;
- inspect and replay the Messages used to derive shared state;
- understand why a consequential transition was allowed or rejected;
- refuse undisclosed computation, telemetry, mining, or resource consumption;
- keep private state private and revoke previously granted capabilities;
- challenge evidence, answer a claim, appeal a decision, and obtain a remedy;
- leave, fork, or replace a service while retaining portable information; and
- use quiet, offline, reduced-motion, low-light, and assistive presentations.

## Rule Zero as Constitution and game

Every Cardboard client recognizes the portable route `/0`. A platform adds its
own carrier without changing the route or its meaning:

```text
Web             https://abcde.example/0
Native          cardboard://abcde/0
Terminal        cardboard host abcde /0
Portable value  /0
```

The canonical `/0` screen contains one renderer-neutral `CardboardButton`. Its
text is `4`, its accessible label is `Next`, and its action maps to the factual
Message `AdvancedCardboardSequence`. Update derives `5`; the route printer
emits `/0/5`. Repeating that transition produces `/0/6`, `/0/7`, and so on.
This models an unbounded sequence with one finite natural value and one
transition rule. It does not allocate an infinite list.

React, Foldkit, React Native, CLI, and TUI consume the same semantic component.
Each renderer chooses layout for its surface, including tiny, drawer, phone,
car, television, browser, and native application contexts. The Program does
not store viewport or framework details.

### Archived black-button study

The earlier black-button interaction remains a noncanonical study. Its initial
game state has `slashCount = 0`. The objective is to keep it there.
Rules are philosophical claims made operational through stable identifiers,
versions, Schemas, tests, evidence, review, and replayable decisions. A host may
publish a game, accept typed proposals, and process allowed transitions without
accepting arbitrary executable Messages.

The first prototype is the Constitution's black button. It exercises one small
state machine through visual, keyboard, screen-reader, terminal, speech,
haptic, and future tactile presentations.

The initial presentation is black. It contains one black square control. Its
semantic label, focus behavior, keyboard behavior, tactile behavior, and
accessible readout exist even when its visual edge is intentionally subtle.

The portable onboarding state is:

```text
WaitingAtZero
| PressingZero(elapsedMilliseconds)
| OpeningZero(progressPermille)
| ConfiguringAtZero(accessibilityProfile, isRgbInverted)
| ChoosingInputMethod(accessibilityProfile, isRgbInverted)
| RejectedInputMethodChoice(attemptedInputMethod, accessibilityProfile)
| CompletedAtZero(accessibilityProfile, isRgbInverted, riddleResolution)
```

The portable input and lifecycle facts are:

```text
PressedZeroButton
| AdvancedZeroButtonHold(elapsedMilliseconds)
| ReleasedZeroButton
| AdvancedZeroOpening(progressPermille)
| CompletedZeroOpening
| SelectedAccessibilityProfile(profile)
| ToggledRgbInversion
| SelectedIncorrectInputMethod(inputMethod)
| SelectedMirrorAnswer
| SkippedZeroStep
| CompletedZeroGame
| ReturnedToZeroStart
```

A quick press and release returns to `WaitingAtZero` and presents the semantic
feedback “Black button pressed.” A continued hold progressively lowers the
block. Crossing the hold threshold begins the opening transition. Completion
reveals the accessibility configuration without a host fabricating a
navigation state.

Every host maps the same semantic feedback to its available outputs: visible
readout, synthesized speech, haptics, terminal text, tones, Braille, radio
description, or another declared medium. The terminal presentation prints the
same state facts while a button is held:

```text
state PressingZero
held 1.2s
feedback "Black button held for 1.2 seconds."
```

Feedback capability is injected. It is not detected inside the Program. The
meaning does not rely on a user having seen, heard, spoken, or physically
pressed anything.

The prototype accepts Arrow Left and `h` for the previous choice, Arrow Right
and `l` for the next choice, `G` or semicolon to complete, and three Space
presses to skip the current step. Canonical Vim `gg` returns to the beginning;
using `GG` for completion would conflict with Vim's established grammar.

The next state is a replayable dungeon riddle: “If you are looking at
yourself, where are you looking?” The choices include era-specific controller
silhouettes, mouse and keyboard, joystick, eyes, directional head poses, and a
mirror. Controller art, color, touch, keyboard, and terminal shortcuts are host
presentations. `SelectedIncorrectInputMethod` and `SelectedMirrorAnswer` are
portable facts. Only the Mirror fact reaches `CompletedAtZero`; an explicit
skip has its own typed resolution.

## Implemented clients

The canonical implementation lives in `examples/cardboard/core`. The Foldkit,
React, Expo, raw CLI, and TUI packages import that exact Program. React and
Expo share one renderer-neutral binding package whose public actions exclude
internal timer Messages.

```text
examples/cardboard/core             Model, Message, Machine, Program, route
examples/cardboard/foldkit          Foldkit HTML presentation
examples/cardboard/react-bindings   React and React Native observation/actions
examples/cardboard/react            React presentation
examples/cardboard/cli              one-shot text presentation
examples/cardboard/tui              interactive text presentation
examples/react-native-showcase      Expo Web, iOS, and Android presentation
```

Expo proves native iOS and Android primitives over the TypeScript Program. A
standalone Swift, Kotlin, or Flutter client is not claimed yet. Those clients
need either a portable TypeScript execution boundary or a faithful runtime and
Effect port before they can consume the same Program without duplicating its
business rules.

Interactive clients use the runtime's non-blocking `send` operation so a press
can remain active while further input arrives. One-shot clients use `run` when
they must wait for a finite causal Command chain before printing or exiting.

## Portable interaction boundary

A generated presentation receives one immutable, Schema-validated `params`
value. It does not receive domain functions. Its elements declare compact event
symbols and Schema payloads. A client adapter interprets those declarations,
creates stable native callbacks, and sends the corresponding domain Messages
into the Program.

Semantic time belongs to the Program runtime through Commands, Subscriptions,
and injected clocks. React and React Native contain no application timers.
Their native renderers may interpolate paint and animation frames from pure
parameters. When an animation completion affects behavior, the adapter reports
that completed fact as a Message.

Voice recognition is another input adapter. A recognized phrase maps to the
same event symbol and domain Message as a button, keyboard command, terminal
command, agent request, or another input medium. Input provenance may be kept in
runtime diagnostics when useful, but it does not create a second business
event.

Four-to-six-character uppercase symbols remain a proposed human notation, not
the global identity by themselves. A global event address must also identify
the Program archetype, Program version, Message Schema, and canonical payload.
The exact grammar remains open until round-trip and collision tests prove it.

## Accessibility configuration

The first configuration selects a presentation profile rather than asking a
person to name a diagnosis. The initial profiles are Amber Paper, Quiet Black,
Groovebox, Groovebox Through Invert, Negative, and High Contrast. Each profile
records color tokens, contrast, brightness, type scale, motion, audio, haptics,
speech, and reading-position preferences.

The prototype's testable negative transform is the literal RGB function
`(red, green, blue) -> (255 - red, 255 - green, 255 - blue)`. Groovebox Through
Invert stores the inverse of the desired warm Groovebox palette so applying the
transform produces the intended colors. This is not labeled as Apple's Smart
Invert algorithm, whose media-sensitive implementation is not a public color
formula.

The selected profile changes presentation only. It does not change the
underlying Program state or the meaning of its Messages.

## Effect Machine comparison

The installed `effect@4.0.0-beta.97` has no general Machine API. Foldkit does
provide `foldkit/experimental/machine`. Cardboard uses that pure transition
graph inside its ordinary Program. The Machine defines legal tagged states,
Messages, guards, edges, and static analysis. It does not become a second
runtime. The Program still owns Model, update, Commands, Subscriptions, routes,
and replay.

This is a good fit for navigation when destinations are tagged Model states and
legal edges are Messages handled by update. It is a poor fit when a host router
or native navigation stack becomes another authority that can transition
without the Program.

## Hosting and verified execution

Becoming a host means serving a portable Program, its Constitution at `/0`, and
the evidence needed to verify its build and behavior. Nix or another hermetic
build system can later provide content-addressed, reproducible artifacts and
shared caches. A route may identify an artifact and typed intent, but the host
still decides whether to fetch, verify, sandbox, grant capabilities, and run it.

A harmless boundary-probe game may visibly report that a test Message crossed
a host boundary. It must be explicit and reversible. It does not silently plant
a cookie, impersonate malware, or treat a stake as consent to execute code.

## Creating, testing, and deleting rules

1. **Propose.** Give the rule a stable identifier, purpose, affected rights,
   evidence, tests, review date, expiry, and repeal conditions.
2. **Simulate.** Replay representative and adversarial tapes without executing
   historical side effects.
3. **Review.** Give affected participants notice and an accessible opportunity
   to respond.
4. **Adopt.** Publish the exact version, decision, evidence, and effective
   interval.
5. **Observe.** Measure intended value, resource use, errors, unequal effects,
   and unintended incentives.
6. **Repair.** Amend, suspend, reverse, or compensate when observed outcomes
   violate the rule's purpose or rights.
7. **Delete.** Repeal a rule when evidence shows that removal preserves or
   improves the protected outcome. Reward verified simplification, not deletion
   by itself.

## Points and stakes

A point is not truth and does not manufacture market predictability. It is a
typed claim stake with an exact owner, amount, currency, valuation timestamp,
claim identifier, settlement rule, and disposition. A separately versioned
price-reference basket may normalize unlike currencies for comparison. Its
inputs, weights, timestamp, and uncertainty remain inspectable external data.

## Book excerpts

Cardboard may summarize a published work or process photographs supplied by
its owner. It does not reproduce non-user-provided pages merely because a copy
is owned. User-supplied photographs can be transcribed and discussed within
the applicable privacy and sharing boundary.
