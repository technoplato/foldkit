import { Option, Schema as S } from 'effect'

import { ReplicateStep } from './replicate.js'

// MODEL

/** Yes or no recorded on a hash-tape guess. */
export const GuessAnswer = S.Literals(['y', 'n'])
/** Yes or no recorded on a hash-tape guess. */
export type GuessAnswer = typeof GuessAnswer.Type

/** Category hint (`?cat=sports`). */
export const CategoryHint = S.TaggedStruct('CategoryHint', {
  category: S.String,
})
/** Category hint (`?cat=sports`). */
export type CategoryHint = typeof CategoryHint.Type

/** Initial-letter hint (`?F`). */
export const InitialHint = S.TaggedStruct('InitialHint', {
  letter: S.String,
})
/** Initial-letter hint (`?F`). */
export type InitialHint = typeof InitialHint.Type

/** Plain hint (`?hint`). */
export const PlainHint = S.TaggedStruct('PlainHint', {
  text: S.String,
})
/** Plain hint (`?hint`). */
export type PlainHint = typeof PlainHint.Type

/** Hint body after `?` in hash-tape grammar `guess=y|n?hint`. */
export const HintRequest = S.Union([CategoryHint, InitialHint, PlainHint])
/** Hint body after `?` in hash-tape grammar `guess=y|n?hint`. */
export type HintRequest = typeof HintRequest.Type

/** Knophy Operator origin. Public host, no private path. */
export const operatorOrigin = 'https://grok.knophy.com'

/** Identity payload `post()` fans out before URLs return. */
export const IdentityPayload = S.Struct({
  subject: S.String,
  session: S.String,
})
/** Identity payload `post()` fans out before URLs return. */
export type IdentityPayload = typeof IdentityPayload.Type

/** URLs returned by Operator `post()`. */
export const OperatorUrls = S.Struct({
  observe: S.String,
  verify: S.String,
  dispatch: S.String,
})
/** URLs returned by Operator `post()`. */
export type OperatorUrls = typeof OperatorUrls.Type

/** Websocket observe payload for analytics and logs. */
export const OperatorObservation = S.Struct({
  analytics: S.Array(S.String),
  logs: S.Array(S.String),
})
/** Websocket observe payload for analytics and logs. */
export type OperatorObservation = typeof OperatorObservation.Type

/** `[operator-verify]` email on the Knophy public Operator. */
export const OperatorEmail = S.Struct({
  email: S.String,
})
/** `[operator-verify]` email on the Knophy public Operator. */
export type OperatorEmail = typeof OperatorEmail.Type

/** `[operator-dispatch]` receipt. */
export const OperatorDispatchReceipt = S.Struct({
  target: S.String,
})
/** `[operator-dispatch]` receipt. */
export type OperatorDispatchReceipt = typeof OperatorDispatchReceipt.Type

/** `post()` accepted, identity fanned out, URLs not yet back. */
export const OperatorPosted = S.TaggedStruct('OperatorPosted', {
  origin: S.Literal(operatorOrigin),
  identity: IdentityPayload,
})
/** `post()` accepted, identity fanned out, URLs not yet back. */
export type OperatorPosted = typeof OperatorPosted.Type

/** URLs returned. Observe has not started. */
export const OperatorOpened = S.TaggedStruct('OperatorOpened', {
  origin: S.Literal(operatorOrigin),
  identity: IdentityPayload,
  urls: OperatorUrls,
})
/** URLs returned. Observe has not started. */
export type OperatorOpened = typeof OperatorOpened.Type

/** Websocket observe has analytics and logs. */
export const OperatorObserved = S.TaggedStruct('OperatorObserved', {
  origin: S.Literal(operatorOrigin),
  identity: IdentityPayload,
  urls: OperatorUrls,
  observation: OperatorObservation,
})
/** Websocket observe has analytics and logs. */
export type OperatorObserved = typeof OperatorObserved.Type

/** `[operator-verify]` email accepted. */
export const OperatorVerified = S.TaggedStruct('OperatorVerified', {
  origin: S.Literal(operatorOrigin),
  identity: IdentityPayload,
  urls: OperatorUrls,
  observation: OperatorObservation,
  email: S.String,
})
/** `[operator-verify]` email accepted. */
export type OperatorVerified = typeof OperatorVerified.Type

/** `[operator-dispatch]` finished. Terminal Operator phase. */
export const OperatorDispatched = S.TaggedStruct('OperatorDispatched', {
  origin: S.Literal(operatorOrigin),
  identity: IdentityPayload,
  urls: OperatorUrls,
  observation: OperatorObservation,
  email: S.String,
  dispatch: OperatorDispatchReceipt,
})
/** `[operator-dispatch]` finished. Terminal Operator phase. */
export type OperatorDispatched = typeof OperatorDispatched.Type

/**
 * Operator grok.knophy.com flow. One phase at a time.
 * Posted cannot dispatch. Verified cannot skip observe.
 */
export const OperatorPhase = S.Union([
  OperatorPosted,
  OperatorOpened,
  OperatorObserved,
  OperatorVerified,
  OperatorDispatched,
])
/** Operator grok.knophy.com flow. One phase at a time. */
export type OperatorPhase = typeof OperatorPhase.Type

/** Label waiting for a guess or hint. */
export const LabelStep = S.TaggedStruct('LabelStep', {
  label: S.String,
})
/** Label waiting for a guess or hint. */
export type LabelStep = typeof LabelStep.Type

/** Settled guess. Optional hint is `?hint` after `=y|n`. */
export const GuessStep = S.TaggedStruct('GuessStep', {
  label: S.String,
  answer: GuessAnswer,
  hint: S.Option(HintRequest),
})
/** Settled guess. Optional hint is `?hint` after `=y|n`. */
export type GuessStep = typeof GuessStep.Type

/** Hint without a guess (`label?hint`). */
export const HintStep = S.TaggedStruct('HintStep', {
  label: S.String,
  hint: HintRequest,
})
/** Hint without a guess (`label?hint`). */
export type HintStep = typeof HintStep.Type

/** Operator step. Phase is the flow ADT, not a string list. */
export const OperatorStep = S.TaggedStruct('OperatorStep', {
  phase: OperatorPhase,
})
/** Operator step. Phase is the flow ADT, not a string list. */
export type OperatorStep = typeof OperatorStep.Type

/**
 * One hash-tape step. Guess, hint, open label, Operator, or Replicate.
 * Not a string list.
 */
export const Step = S.Union([
  LabelStep,
  GuessStep,
  HintStep,
  OperatorStep,
  ReplicateStep,
])
/** One hash-tape step. */
export type Step = typeof Step.Type

/** Current prompt. Label, Operator, or Replicate. */
export const Prompt = S.Union([LabelStep, OperatorStep, ReplicateStep])
/** Current prompt. */
export type Prompt = typeof Prompt.Type

/** True when the step is a settled Operator dispatch. */
export const isDispatchedOperator = (step: Step): boolean =>
  step._tag === 'OperatorStep' && step.phase._tag === 'OperatorDispatched'

/** Label on a guess, hint, or open label. Operator has none. */
export const labelOf = (step: Step): Option.Option<string> => {
  if (step._tag === 'OperatorStep' || step._tag === 'ReplicateStep') {
    return Option.none()
  }
  return Option.some(step.label)
}
