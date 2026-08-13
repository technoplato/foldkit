---
name: foldkit-schema-modeling
description: Model Foldkit state, Messages, routes, persisted values, and replay-safe protocols with Effect Schema. Use when adding domain types, removing invalid state combinations, evolving serialized Program data, or reviewing casts and plain TypeScript types in a Foldkit app.
---

# Foldkit Schema Modeling

Make domain values executable specifications. Foldkit uses Schema values for
runtime decoding, encoded state, replay, routes, and developer tooling, not only
for TypeScript inference.

## Workflow

1. Inventory every state and transition before choosing fields.
2. Use `Schema.Struct` for product types and `Schema.Union` of tagged structs
   for mutually exclusive states. Use `m` from `foldkit/message` for Messages
   and `ts` from `foldkit/schema` where its tagged constructor fits.
3. Export full Schema names such as `Model`, `Message`, and domain nouns. Export
   `typeof SchemaValue.Type` aliases only when consumers need the type.
4. Use `Option` for modeled absence and a tagged state such as Idle, Loading,
   Failure, or Success for async phases. Do not encode absence with empty
   strings, zero, `null`, or an unrelated boolean.
5. Construct Schema values with their callable constructor or `.make`. Do not
   cast plain objects into Schema types.
6. Make update matching exhaustive with Effect `Match`. A newly added Message
   or Model case should produce a compile-time obligation.
7. For a portable Program, keep Model and Message codecs service-free. Bump the
   Program version and add explicit migrations when an encoded replay contract
   changes.
8. Test representative decode and encode failures, exhaustive transitions, and
   replay or route round trips for serialized values.

## Review checks

- Reject plain TypeScript-only Model or Message declarations.
- Reject `as const` or type casts used as substitutes for Schema constructors.
- Reject boolean combinations that admit impossible presentation states.
- Reject `isReading && isOpen` flags. Mutually exclusive player or UI
  attention is `Roaming | Reading<Subject> | Operating<Tool>` from
  `foldkit/attention`. Overlay is not a nullable field beside a walking flag.
- Use `foldkit/spatial` for `GridCoord` and `CardinalFacing`. Do not invent a
  second grid or facing Schema when those primitives fit.
- Keep effect handles, DOM nodes, fibers, subscriptions, and native navigation
  objects out of Model.
- Keep Message names factual and past tense. Keep Command names imperative.

## Source anchors

- `packages/foldkit/src/program/program.ts`
- `packages/foldkit/src/runtime/replayTape.ts`
- `packages/foldkit/src/schema/public.ts`
- `packages/foldkit/src/message/public.ts`
- `packages/foldkit/src/attention/public.ts`
- `packages/foldkit/src/spatial/public.ts`
- `packages/foldkit/src/interactable/public.ts`
- `examples/world/core/src/`
- `examples/counters/core/src/model.ts`
- `examples/counters/core/src/message.ts`
- `examples/message-versioning/src/`
