# ADR 0006 | Semantic Messages and Invocation Provenance

Date: 2026-08-01

Status: Accepted for staged implementation

## Context

A Foldkit Program can be driven by a pointer, keyboard, touch screen, accessibility
action, automation, remote Processor, or embedded agent. A Client-specific Message
such as `TappedCounterButton` is false when Enter or an agent invoked the same
interaction. A semantic Message alone, however, does not explain who invoked it or
how it entered the Program.

That provenance matters for authorization, debugging, replay inspection, product
analytics, and AI-assisted applications. It must not make Program behavior depend on
one renderer or turn raw input into synchronized domain state.

## Decision

The source Program or Submodel owns each semantic interaction identity and the
canonical Message it produces. Every Client maps its native activation to that same
Message.

```text
native or agent activation
  -> Program-owned semantic interaction
  -> canonical semantic Message
  -> update
```

For example, a click, Enter on a focused row, an accessibility activation, and an
authorized agent tool call can all produce `SelectedCounterDemonstration`. They do
not produce separate `Tapped`, `PressedEnter`, or `AgentSelected` Program Messages.

Invocation provenance is Schema-backed occurrence metadata beside the Message. It is
not an intermediary Message and update does not reduce it. The provenance identifies
the semantic interaction and stable available facts about the actor, Client, device,
Processor, modality, automation, or agent invocation.

Model causal provenance with occurrence, causation, and correlation identities so
validated links can form a graph. Do not recursively copy a tree of causes into every
Message payload. Raw keys, pointer coordinates, prompts, credentials, and other
sensitive or renderer-local details remain outside the canonical Program history.

The current `TransitionSource` is the foundation for classifying runtime sources. A
Message envelope and accepted Instant occurrence records separately preserve actor,
Client, device, Processor, occurrence, causation, and correlation identities.
`AcceptedMessage` links a journal transition to its accepted occurrence. These layers
do not yet attest every claimed identity or distinguish human input modalities,
automation, semantic interactions, and agent invocations. Extending and connecting
those surfaces is staged implementation work.

Authentication and admission must attest provenance claims before consumers trust
them. The current generic shared Processor and admission path do not attest every
host-supplied Client, device, or Processor identity, so those values remain claims. If
actor identity or intent changes domain meaning, the Program still models the required
domain fact explicitly and authorization independently verifies it. Provenance must
not become an untrusted shortcut around domain authorization.

Replay preserves recorded occurrence provenance for inspection while reconstructing
Model only from canonical Messages. A Client sending a new action after branching must
issue fresh provenance rather than present it as if the original actor invoked it. The
current runtime accepts caller-supplied envelopes and does not enforce that freshness,
so enforcement is staged implementation work.

## Consequences

- Program Messages remain portable across Foldkit, React, React Native, CLI, TUI,
  accessibility, automation, and agent Clients.
- After the versioned extension and attestation work, audit and AI features can
  distinguish how the same semantic action was invoked.
- Clients may record richer local diagnostics without synchronizing raw input.
- Runtime and transport schemas need an explicit, versioned invocation-provenance
  extension before richer origin claims are considered implemented.
- Conformance tests should prove that different Clients produce the same semantic
  Message while retaining distinct occurrence provenance.
