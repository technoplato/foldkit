import { CounterProgram } from 'counter-core-example'
import { Schema as S } from 'effect'

import { EffectRequestKind } from './message.js'

/** An effect request has been accepted but not placed yet. */
export const RequestedEffectState = S.TaggedStruct('RequestedEffectState', {
  kind: EffectRequestKind,
  requestId: S.String,
})

/** An effect request is waiting for a compatible live Processor. */
export const WaitingEffectState = S.TaggedStruct('WaitingEffectState', {
  kind: EffectRequestKind,
  requestId: S.String,
})

/** One Processor has been selected to execute an effect. */
export const AssignedEffectState = S.TaggedStruct('AssignedEffectState', {
  kind: EffectRequestKind,
  processorId: S.String,
  requestId: S.String,
})

/** A delegated effect completed successfully. */
export const SucceededEffectState = S.TaggedStruct('SucceededEffectState', {
  kind: EffectRequestKind,
  processorId: S.String,
  requestId: S.String,
  summary: S.String,
})

/** A delegated effect reached a factual failure. */
export const FailedEffectState = S.TaggedStruct('FailedEffectState', {
  kind: EffectRequestKind,
  maybeProcessorId: S.OptionFromNullOr(S.String),
  reason: S.String,
  requestId: S.String,
})

/** Every accepted lifecycle state of one portable effect request. */
export const EffectState = S.Union([
  RequestedEffectState,
  WaitingEffectState,
  AssignedEffectState,
  SucceededEffectState,
  FailedEffectState,
])

/** Every accepted lifecycle state of one portable effect request. */
export type EffectState = typeof EffectState.Type

/** The authoritative Model derived only from accepted Message occurrences. */
export const Model = S.Struct({
  counter: CounterProgram.Model,
  effects: S.Array(EffectState),
})

/** The authoritative Model derived only from accepted Message occurrences. */
export type Model = typeof Model.Type
