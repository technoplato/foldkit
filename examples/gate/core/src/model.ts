import { Duration, Option, Schema as S } from 'effect'
import { PositiveInt } from 'foldkit/adt'
import { ts } from 'foldkit/schema'

// MODEL

const remainingLeftDoesNotExceedCapacity = S.makeFilter(
  (remaining: { readonly left: number; readonly capacity: number }) =>
    remaining.left <= remaining.capacity
      ? undefined
      : {
          path: ['left'],
          issue: 'remaining left does not exceed capacity',
        },
  {
    identifier: 'RemainingQuota',
    description: 'remaining left does not exceed capacity',
  },
)

/** Remaining quota. Left is at least 1 and does not exceed capacity. */
const RemainingSchema = S.TaggedStruct('Remaining', {
  left: PositiveInt,
  capacity: PositiveInt,
  resets: S.DurationFromMillis,
}).check(remainingLeftDoesNotExceedCapacity)

/** Remaining quota. Left is at least 1 and does not exceed capacity. */
export const Remaining = (
  value: Readonly<{
    left: number
    capacity: number
    resets: Duration.Duration
  }>,
): Remaining => RemainingSchema.make(value)
/** Remaining quota. Left is at least 1 and does not exceed capacity. */
export type Remaining = typeof RemainingSchema.Type

/** Exhausted quota. Capacity is remembered. Left is not a value. */
export const Exhausted = ts('Exhausted', {
  capacity: PositiveInt,
  resets: S.DurationFromMillis,
})
/** Exhausted quota. Capacity is remembered. Left is not a value. */
export type Exhausted = typeof Exhausted.Type

/** Rate or message quota. Remaining and Exhausted are exclusive. */
export const Quota = S.Union([RemainingSchema, Exhausted])
/** Rate or message quota. Remaining and Exhausted are exclusive. */
export type Quota = typeof Quota.Type

/** Origin returned 502. */
export const BadGateway = ts('BadGateway')
/** Origin could not be reached. */
export const Unreachable = ts('Unreachable')
/** Origin response was not a tagged Read. */
export const Invalid = ts('Invalid')

/** Why a Gate origin read failed. */
export const OriginFailure = S.Union([BadGateway, Unreachable, Invalid])
/** Why a Gate origin read failed. */
export type OriginFailure = typeof OriginFailure.Type

/** Origin has not been read. Restore may inhabit this. */
export const Unread = ts('Unread')
/** Origin read is in flight. */
export const Reading = ts('Reading')
/** Origin read failed. */
export const Failed = ts('Failed', { reason: OriginFailure })
/** Origin read succeeded. Rate and messages are sibling quotas. */
export const Read = ts('Read', {
  rate: Quota,
  messages: Quota,
})

/** Gate origin. Unread, Reading, Failed, and Read are exclusive. */
export const Origin = S.Union([Unread, Reading, Failed, Read])
/** Gate origin. Unread, Reading, Failed, and Read are exclusive. */
export type Origin = typeof Origin.Type

/** Origin result a capability may return. Unread and Reading are local. */
export const OriginReport = S.Union([Read, Failed])
/** Origin result a capability may return. Unread and Reading are local. */
export type OriginReport = typeof OriginReport.Type

/** Gate Model. Origin is wrapped so Synced Ready keeps origin tags. */
export const Model = S.Struct({
  origin: Origin,
})
/** Gate Model. Origin is wrapped so Synced Ready keeps origin tags. */
export type Model = typeof Model.Type

const sampleRateLeft = 40
const sampleRateCapacity = 60
const sampleRateResetsMs = 60_000
const sampleMessagesLeft = 10
const sampleMessagesCapacity = 20
const sampleMessagesResetsMs = 86_400_000

/** Sample remaining rate quota inhabited by the test origin. */
export const sampleRemainingRate = Remaining({
  left: sampleRateLeft,
  capacity: sampleRateCapacity,
  resets: Duration.millis(sampleRateResetsMs),
})

/** Sample remaining messages quota inhabited by the test origin. */
export const sampleRemainingMessages = Remaining({
  left: sampleMessagesLeft,
  capacity: sampleMessagesCapacity,
  resets: Duration.millis(sampleMessagesResetsMs),
})

/** Sample Read inhabited by the test origin. */
export const sampleRead = Read({
  rate: sampleRemainingRate,
  messages: sampleRemainingMessages,
})

/** Model whose origin has not been read. */
export const unreadModel = Model.make({ origin: Unread() })
/** Model whose origin read is in flight. */
export const readingModel = Model.make({ origin: Reading() })
/** Model whose origin is the sample Read. */
export const readModel = Model.make({ origin: sampleRead })
/** Model whose origin failed with BadGateway. */
export const failedBadGatewayModel = Model.make({
  origin: Failed({ reason: BadGateway() }),
})
/** Model whose origin failed with Unreachable. */
export const failedUnreachableModel = Model.make({
  origin: Failed({ reason: Unreachable() }),
})
/** Model whose origin failed with Invalid. */
export const failedInvalidModel = Model.make({
  origin: Failed({ reason: Invalid() }),
})

/** Decodes Remaining through the remaining-left filter. */
export const decodeRemaining = (value: unknown): Option.Option<Remaining> =>
  S.decodeUnknownOption(RemainingSchema)(value)

/** Model whose origin has not been read. Standalone hosts start here. */
export const emptyModel = (): Model => unreadModel
