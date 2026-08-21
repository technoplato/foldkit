import { Clock, Context, Data, Duration, Effect, Layer } from 'effect'

export const videoOpenDelayMs = 320
export const videoAdmitDelayMs = 240
export const videoArriveDelayMs = 360
export const videoShareDelayMs = 200
export const videoLeaveDelayMs = 180

export class VideoError extends Data.TaggedError('VideoError')<{
  readonly operation: 'Open' | 'Leave' | 'Admit' | 'Arrive' | 'Invite' | 'Share'
  readonly reason: string
}> {}

export type VideoOpened = Readonly<{
  readonly meetingId: string
  readonly callId: string
  readonly openedAt: number
  readonly connectedAt: number
}>

export type VideoLeft = Readonly<{
  readonly callId: string
  readonly finishedAt: number
}>

export type VideoAdmitted = Readonly<{
  readonly participantId: string
  readonly admittedAt: number
}>

export type VideoArrived = Readonly<{
  readonly participantId: string
  readonly arrivedAt: number
}>

export type VideoInvited = Readonly<{
  readonly participantId: string
  readonly invitedAt: number
}>

export type VideoShared = Readonly<{
  readonly meetingId: string
  readonly at: number
}>

export type VideoService = Readonly<{
  open: (args: {
    meetingId: string
    callId: string
  }) => Effect.Effect<VideoOpened, VideoError>
  leave: (args: { callId: string }) => Effect.Effect<VideoLeft, VideoError>
  admit: (args: {
    participantId: string
  }) => Effect.Effect<VideoAdmitted, VideoError>
  arrive: (args: {
    participantId: string
  }) => Effect.Effect<VideoArrived, VideoError>
  invite: (args: {
    participantId: string
  }) => Effect.Effect<VideoInvited, VideoError>
  startShare: (args: {
    meetingId: string
  }) => Effect.Effect<VideoShared, VideoError>
  stopShare: (args: {
    meetingId: string
  }) => Effect.Effect<VideoShared, VideoError>
}>

export class Video extends Context.Service<Video, VideoService>()(
  'advocacy-core-example/Video',
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

const makeVideo = (delays: {
  open: number
  leave: number
  admit: number
  arrive: number
  share: number
}): VideoService => ({
  open: ({ meetingId, callId }) =>
    timed(delays.open, at => ({
      meetingId,
      callId,
      openedAt: at,
      connectedAt: at,
    })),
  leave: ({ callId }) =>
    timed(delays.leave, finishedAt => ({ callId, finishedAt })),
  admit: ({ participantId }) =>
    timed(delays.admit, admittedAt => ({ participantId, admittedAt })),
  arrive: ({ participantId }) =>
    timed(delays.arrive, arrivedAt => ({ participantId, arrivedAt })),
  invite: ({ participantId }) =>
    timed(delays.admit, invitedAt => ({ participantId, invitedAt })),
  startShare: ({ meetingId }) => timed(delays.share, at => ({ meetingId, at })),
  stopShare: ({ meetingId }) => timed(delays.share, at => ({ meetingId, at })),
})

export const ImmediateVideo = Layer.succeed(
  Video,
  makeVideo({ open: 0, leave: 0, admit: 0, arrive: 0, share: 0 }),
)

export const DelayedVideo = Layer.succeed(
  Video,
  makeVideo({
    open: videoOpenDelayMs,
    leave: videoLeaveDelayMs,
    admit: videoAdmitDelayMs,
    arrive: videoArriveDelayMs,
    share: videoShareDelayMs,
  }),
)
