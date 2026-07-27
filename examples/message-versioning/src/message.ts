import {
  Data,
  Effect,
  Option,
  Schema as S,
  SchemaIssue,
  SchemaTransformation,
  pipe,
} from 'effect'
import { m } from 'foldkit/message'
import type { CallableTaggedStruct } from 'foldkit/schema'

/** The stable identifier shared by every wire version of this event. */
export const counterAdjustedEventId = 'Foldkit.Example.CounterAdjusted'

const CounterAdjustedEventId = S.Literal(counterAdjustedEventId)
const CurrentMessageVersion = S.Literal(2)

/** The canonical public v0 representation of the Counter adjustment event. */
export const WireMessageV0 = S.Struct({
  eventId: S.Literal(counterAdjustedEventId),
  version: S.Literal(0),
  payload: S.Struct({ delta: S.Int }),
})
/** A canonical public v0 Counter adjustment event. */
export type WireMessageV0 = typeof WireMessageV0.Type

/** The intermediate v1 representation that renamed delta to amount. */
export const WireMessageV1 = S.Struct({
  eventId: S.Literal(counterAdjustedEventId),
  version: S.Literal(1),
  payload: S.Struct({ amount: S.Int }),
})
/** An intermediate v1 Counter adjustment event. */
export type WireMessageV1 = typeof WireMessageV1.Type

/** The provenance retained by the current domain Message. */
export const AdjustmentOrigin = S.Literals(['Legacy', 'User', 'Automation'])
/** The provenance retained by the current domain Message. */
export type AdjustmentOrigin = typeof AdjustmentOrigin.Type

/** Records that the Counter was adjusted in the current domain. */
export const AdjustedCounter: CallableTaggedStruct<
  'AdjustedCounter',
  {
    eventId: typeof CounterAdjustedEventId
    version: typeof CurrentMessageVersion
    amount: typeof S.Int
    origin: typeof AdjustmentOrigin
  }
> = m('AdjustedCounter', {
  eventId: CounterAdjustedEventId,
  version: CurrentMessageVersion,
  amount: S.Int,
  origin: AdjustmentOrigin,
})

/** Every Message accepted by the current version of the Program. */
export const Message = S.Union([AdjustedCounter])
/** A current Counter Message. */
export type Message = typeof Message.Type

/** A current Message contains information that v0 cannot represent. */
export class MessageDowngradeError extends Data.TaggedError(
  'MessageDowngradeError',
)<{
  readonly eventId: string
  readonly reason: string
}> {}

/** Deterministically upgrades the canonical v0 representation to v1. */
export const upgradeV0ToV1 = (message: WireMessageV0): WireMessageV1 =>
  WireMessageV1.make({
    eventId: message.eventId,
    version: 1,
    payload: { amount: message.payload.delta },
  })

/** Deterministically upgrades the v1 representation to the current Message. */
export const upgradeV1ToCurrent = (message: WireMessageV1): Message =>
  AdjustedCounter({
    eventId: message.eventId,
    version: 2,
    amount: message.payload.amount,
    origin: 'Legacy',
  })

/** Deterministically upgrades the canonical v0 representation to current. */
export const upgradeV0ToCurrent = (message: WireMessageV0): Message =>
  upgradeV1ToCurrent(upgradeV0ToV1(message))

/** Downgrades a current Message only when v0 can represent it exactly. */
export const downgradeCurrentToV0 = (
  message: Message,
): Effect.Effect<WireMessageV0, MessageDowngradeError> => {
  if (message.origin !== 'Legacy') {
    return Effect.fail(
      new MessageDowngradeError({
        eventId: message.eventId,
        reason: `v0 cannot represent the ${message.origin} origin`,
      }),
    )
  }
  return Effect.succeed(
    WireMessageV0.make({
      eventId: message.eventId,
      version: 0,
      payload: { delta: message.amount },
    }),
  )
}

/** A bidirectional Schema codec whose encoding direction rejects lossy v0 downgrades. */
export const CurrentMessageFromV0: S.Codec<
  Message,
  WireMessageV0,
  never,
  never
> = WireMessageV0.pipe(
  S.decodeTo(
    Message,
    SchemaTransformation.transformOrFail({
      decode: message => Effect.succeed(upgradeV0ToCurrent(message)),
      encode: message =>
        pipe(
          downgradeCurrentToV0(message),
          Effect.mapError(
            error =>
              new SchemaIssue.InvalidValue(Option.some(message), {
                description: error.reason,
              }),
          ),
        ),
    }),
  ),
)
