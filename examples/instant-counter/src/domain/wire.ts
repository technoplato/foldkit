import { Effect, Match as M, Schema as S } from 'effect'
import { Program } from 'foldkit'

import {
  AssignedEffect,
  ClickedDecrement,
  ClickedIncrement,
  ClickedReset,
  FailedEffect,
  type Message,
  RejectedEffect,
  RequestedEffect,
  SucceededEffect,
  WaitedForEffectProcessor,
} from './message.js'

/** A current event identifier and JSON payload ready for an envelope. */
export type EncodedEvent = Readonly<{
  eventId: string
  eventVersion: number
  payload: S.Json
}>

const eventIds = {
  clickedDecrement: 'Counter.ClickedDecrement',
  clickedIncrement: 'Counter.ClickedIncrement',
  clickedReset: 'Counter.ClickedReset',
  legacyAdjustedCounter: 'InstantCounter.AdjustedCounter',
  assignedEffect: 'InstantCounter.AssignedEffect',
  failedEffect: 'InstantCounter.FailedEffect',
  rejectedEffect: 'InstantCounter.RejectedEffect',
  requestedEffect: 'InstantCounter.RequestedEffect',
  succeededEffect: 'InstantCounter.SucceededEffect',
  waitedForEffectProcessor: 'InstantCounter.WaitedForEffectProcessor',
}

/** Returns whether an event records an authority-owned placement fact. */
export const isEffectPlacementEventId = (eventId: string): boolean =>
  eventId === eventIds.assignedEffect ||
  eventId === eventIds.rejectedEffect ||
  eventId === eventIds.waitedForEffectProcessor

const LegacyAdjustedCounterPayloadV0 = S.Struct({
  delta: S.Literals([-1, 0, 1]),
})
type LegacyAdjustedCounterPayloadV0 = typeof LegacyAdjustedCounterPayloadV0.Type
const LegacyAdjustedCounterPayloadV1 = S.Union([
  S.Struct({
    amount: S.Literal(1),
    control: S.Literal('Increment'),
  }),
  S.Struct({
    amount: S.Literal(-1),
    control: S.Literal('Decrement'),
  }),
  S.Struct({
    amount: S.Literal(0),
    control: S.Literal('Reset'),
  }),
])
type LegacyAdjustedCounterPayloadV1 = typeof LegacyAdjustedCounterPayloadV1.Type
const CounterControlPayload = S.Struct({})

const controlForLegacyDelta = (
  delta: LegacyAdjustedCounterPayloadV0['delta'],
): LegacyAdjustedCounterPayloadV1['control'] => {
  if (delta === -1) {
    return 'Decrement'
  } else if (delta === 0) {
    return 'Reset'
  } else {
    return 'Increment'
  }
}

const RequestedEffectPayload = S.Struct({
  durationMs: RequestedEffect.fields.durationMs,
  kind: RequestedEffect.fields.kind,
  requestId: RequestedEffect.fields.requestId,
})
const AssignedEffectPayload = S.Struct({
  kind: AssignedEffect.fields.kind,
  processorId: AssignedEffect.fields.processorId,
  requestId: AssignedEffect.fields.requestId,
})
const WaitedForEffectProcessorPayload = S.Struct({
  kind: WaitedForEffectProcessor.fields.kind,
  requestId: WaitedForEffectProcessor.fields.requestId,
})
const RejectedEffectPayload = S.Struct({
  kind: RejectedEffect.fields.kind,
  reason: RejectedEffect.fields.reason,
  requestId: RejectedEffect.fields.requestId,
})
const SucceededEffectPayload = S.Struct({
  kind: SucceededEffect.fields.kind,
  processorId: SucceededEffect.fields.processorId,
  requestId: SucceededEffect.fields.requestId,
  summary: SucceededEffect.fields.summary,
})
const FailedEffectPayload = S.Struct({
  kind: FailedEffect.fields.kind,
  processorId: FailedEffect.fields.processorId,
  reason: FailedEffect.fields.reason,
  requestId: FailedEffect.fields.requestId,
})

const makeFamily = <Payload>(
  eventId: string,
  CurrentPayload: Program.ProgramSchema<Payload>,
  toMessage: (payload: Payload) => Message,
) =>
  Effect.runSync(
    Program.makeVersionedEventFamily({
      CurrentPayload,
      currentVersion: 1,
      eventId,
      migrations: [],
      minimumVersion: 1,
      toMessage,
    }),
  )

const LegacyAdjustedCounterFamily = Effect.runSync(
  Program.makeVersionedEventFamily<
    typeof LegacyAdjustedCounterPayloadV1.Type,
    Message
  >({
    CurrentPayload: LegacyAdjustedCounterPayloadV1,
    currentVersion: 1,
    eventId: eventIds.legacyAdjustedCounter,
    migrations: [
      {
        fromVersion: 0,
        migrate: payload => {
          const historical = S.decodeUnknownSync(
            LegacyAdjustedCounterPayloadV0,
          )(payload)
          return {
            amount: historical.delta,
            control: controlForLegacyDelta(historical.delta),
          }
        },
        toVersion: 1,
      },
    ],
    minimumVersion: 0,
    toMessage: payload => {
      if (payload.control === 'Reset') {
        return ClickedReset()
      } else if (payload.control === 'Decrement') {
        return ClickedDecrement()
      } else {
        return ClickedIncrement()
      }
    },
  }),
)

/** The Program-owned adjacent-migration registry for accepted wire events. */
export const EventRegistry = Effect.runSync(
  Program.makeVersionedEventRegistry<Message>({
    currentProgramVersion: 1,
    families: [
      LegacyAdjustedCounterFamily,
      makeFamily(
        eventIds.clickedDecrement,
        CounterControlPayload,
        ClickedDecrement,
      ),
      makeFamily(
        eventIds.clickedIncrement,
        CounterControlPayload,
        ClickedIncrement,
      ),
      makeFamily(eventIds.clickedReset, CounterControlPayload, ClickedReset),
      makeFamily(
        eventIds.requestedEffect,
        RequestedEffectPayload,
        RequestedEffect,
      ),
      makeFamily(
        eventIds.assignedEffect,
        AssignedEffectPayload,
        AssignedEffect,
      ),
      makeFamily(
        eventIds.waitedForEffectProcessor,
        WaitedForEffectProcessorPayload,
        WaitedForEffectProcessor,
      ),
      makeFamily(
        eventIds.rejectedEffect,
        RejectedEffectPayload,
        RejectedEffect,
      ),
      makeFamily(
        eventIds.succeededEffect,
        SucceededEffectPayload,
        SucceededEffect,
      ),
      makeFamily(eventIds.failedEffect, FailedEffectPayload, FailedEffect),
    ],
    programId: 'instant-counter',
  }),
)

/** Encodes one current Message without including credentials or executable code. */
export const encodeMessage = (message: Message): EncodedEvent =>
  M.value(message).pipe(
    M.withReturnType<EncodedEvent>(),
    M.tagsExhaustive({
      ClickedDecrement: () => ({
        eventId: eventIds.clickedDecrement,
        eventVersion: 1,
        payload: {},
      }),
      ClickedIncrement: () => ({
        eventId: eventIds.clickedIncrement,
        eventVersion: 1,
        payload: {},
      }),
      ClickedReset: () => ({
        eventId: eventIds.clickedReset,
        eventVersion: 1,
        payload: {},
      }),
      RequestedEffect: ({ durationMs, kind, requestId }) => ({
        eventId: eventIds.requestedEffect,
        eventVersion: 1,
        payload: {
          durationMs: durationMs._tag === 'Some' ? durationMs.value : null,
          kind,
          requestId,
        },
      }),
      AssignedEffect: ({ kind, processorId, requestId }) => ({
        eventId: eventIds.assignedEffect,
        eventVersion: 1,
        payload: { kind, processorId, requestId },
      }),
      WaitedForEffectProcessor: ({ kind, requestId }) => ({
        eventId: eventIds.waitedForEffectProcessor,
        eventVersion: 1,
        payload: { kind, requestId },
      }),
      RejectedEffect: ({ kind, reason, requestId }) => ({
        eventId: eventIds.rejectedEffect,
        eventVersion: 1,
        payload: { kind, reason, requestId },
      }),
      SucceededEffect: ({ kind, processorId, requestId, summary }) => ({
        eventId: eventIds.succeededEffect,
        eventVersion: 1,
        payload: { kind, processorId, requestId, summary },
      }),
      FailedEffect: ({ kind, processorId, reason, requestId }) => ({
        eventId: eventIds.failedEffect,
        eventVersion: 1,
        payload: { kind, processorId, reason, requestId },
      }),
    }),
  )
