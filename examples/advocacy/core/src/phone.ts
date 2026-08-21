import { Clock, Context, Data, Duration, Effect, Layer } from 'effect'

export const phonePlaceDelayMs = 280
export const phoneConnectDelayMs = 700
export const phoneHangUpDelayMs = 180
export const inboundRingDelayMs = 220

export class PhoneError extends Data.TaggedError('PhoneError')<{
  readonly operation: 'Place' | 'Connect' | 'HangUp' | 'Answer' | 'Ring'
  readonly reason: string
}> {}

export type PhonePlaced = Readonly<{
  readonly callId: string
  readonly fromNumber: string
  readonly openedAt: number
}>

export type PhoneAnswered = Readonly<{
  readonly callId: string
  readonly connectedAt: number
}>

export type PhoneEnded = Readonly<{
  readonly callId: string
  readonly finishedAt: number
}>

export type PhoneRang = Readonly<{
  readonly callId: string
  readonly meetingId: string
  readonly fromNumber: string
  readonly openedAt: number
}>

export type PhoneService = Readonly<{
  place: (args: {
    callId: string
    fromNumber: string
  }) => Effect.Effect<PhonePlaced, PhoneError>
  waitConnected: (args: {
    callId: string
  }) => Effect.Effect<PhoneAnswered, PhoneError>
  hangUp: (args: { callId: string }) => Effect.Effect<PhoneEnded, PhoneError>
  answer: (args: { callId: string }) => Effect.Effect<PhoneAnswered, PhoneError>
  ringInbound: (args: {
    callId: string
    meetingId: string
    fromNumber: string
  }) => Effect.Effect<PhoneRang, PhoneError>
}>

export class Phone extends Context.Service<Phone, PhoneService>()(
  'advocacy-core-example/Phone',
) {}

const timed = <A>(
  delayMs: number,
  build: (at: number) => A,
): Effect.Effect<A> =>
  Effect.gen(function* () {
    if (delayMs > 0) {
      yield* Effect.sleep(Duration.millis(delayMs))
    }
    const at = yield* Clock.currentTimeMillis
    return build(at)
  })

const makePhone = (delays: {
  place: number
  connect: number
  hangUp: number
  ring: number
}): PhoneService => ({
  place: ({ callId, fromNumber }) =>
    timed(delays.place, openedAt => ({ callId, fromNumber, openedAt })),
  waitConnected: ({ callId }) =>
    timed(delays.connect, connectedAt => ({ callId, connectedAt })),
  hangUp: ({ callId }) =>
    timed(delays.hangUp, finishedAt => ({ callId, finishedAt })),
  answer: ({ callId }) =>
    timed(delays.connect, connectedAt => ({ callId, connectedAt })),
  ringInbound: ({ callId, meetingId, fromNumber }) =>
    timed(delays.ring, openedAt => ({
      callId,
      meetingId,
      fromNumber,
      openedAt,
    })),
})

export const ImmediatePhone = Layer.succeed(
  Phone,
  makePhone({ place: 0, connect: 0, hangUp: 0, ring: 0 }),
)

export const DelayedPhone = Layer.succeed(
  Phone,
  makePhone({
    place: phonePlaceDelayMs,
    connect: phoneConnectDelayMs,
    hangUp: phoneHangUpDelayMs,
    ring: inboundRingDelayMs,
  }),
)
