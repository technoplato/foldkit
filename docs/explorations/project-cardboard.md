# Project Cardboard | Rule Zero

Machine-local draft timestamp: Monday, July 27, 2026 at 11:21:02 p.m. EDT
(-0400).

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

1. `/0` is the public, portable home route and contains no private state. It
   may resolve locally to a person's current address, but sharing `/0` cannot
   grant another person access. Sharing private state requires a separate,
   explicit, revocable capability URI.
2. Repeated use cannot prove that software contains no malicious behavior.
   Cardboard can instead provide reproducible builds, signed provenance,
   declared capabilities, resource budgets, deterministic replay, sandboxed
   execution, and public evidence of the behavior actually exercised.
3. A hash cannot make a market cycle repeatable. A point can carry an exact
   timestamped stake, while a separately versioned market reference defines
   its unit of account. Claims about predictability require observed evidence.

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

## Rule Zero onboarding

Every Cardboard client recognizes the portable route `/0`.

The initial presentation is black. It contains one black square control. Its
semantic label, focus behavior, keyboard behavior, tactile behavior, and
accessible readout exist even when its visual edge is intentionally subtle.

The portable onboarding state is:

```text
WaitingAtZero
| PressingZero(elapsedMilliseconds)
| OpeningZero(progressPermille)
| OpenedAtZero(accessibilityProfile)
```

The portable input and lifecycle facts are:

```text
PressedZeroButton
| AdvancedZeroButtonHold(elapsedMilliseconds)
| ReleasedZeroButton
| AdvancedZeroOpening(progressPermille)
| CompletedZeroOpening
| SelectedAccessibilityProfile(profile)
```

A quick press and release returns to `WaitingAtZero` and presents the semantic
feedback “Black button pressed.” A continued hold progressively lowers the
block. Crossing the hold threshold begins the opening transition. Completion
reveals the accessibility configuration without a host fabricating a
navigation state.

Every host maps the same semantic feedback to its available outputs: visible
readout, synthesized speech, haptics, terminal text, tones, Braille, radio
description, or another declared medium. Feedback capability is injected; it
is not detected inside the Program.

## Accessibility configuration

The first configuration selects a presentation profile rather than asking a
person to name a diagnosis. The initial profiles are Amber Paper, Quiet Black,
Negative, and High Contrast. Each profile records color tokens, contrast,
brightness, type scale, motion, audio, haptics, speech, and reading-position
preferences.

The selected profile changes presentation only. It does not change the
underlying Program state or the meaning of its Messages.

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
