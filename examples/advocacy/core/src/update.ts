import { Array, Clock, Effect, Match as M, Option, Schema as S } from 'effect'
import { Command } from 'foldkit'
import type * as CommandModule from 'foldkit/command'
import { evo } from 'foldkit/struct'

import { id } from '@instantdb/core'

import {
  Write,
  WriteCall,
  WriteChat,
  WriteMeeting,
  WriteParticipant,
} from './codec.js'
import {
  FailedObserveGraph,
  FailedPersist,
  FailedPhone,
  FailedVideo,
  type Message,
  ObservedGraph,
  RefusedVideoAfterPhone,
  SucceededChatRecorded,
  SucceededGuestArrived,
  SucceededImpromptuStarted,
  SucceededInboundRang,
  SucceededMeetingFinished,
  SucceededParticipantAdmitted,
  SucceededParticipantArrived,
  SucceededParticipantInvited,
  SucceededPersist,
  SucceededPhoneConnected,
  SucceededPhoneEnded,
  SucceededPhoneOpened,
  SucceededShareStarted,
  SucceededShareStopped,
  SucceededVideoLeft,
  SucceededVideoOpened,
} from './message.js'
import {
  Call,
  Chat,
  type Graph,
  KindPhone,
  KindVideo,
  Meeting,
  type Model,
  OriginImpromptu,
  Participant,
  PhoneConnected,
  PhoneDialing,
  PhoneIdle,
  PhoneNumber,
  PhoneRinging,
  Role,
  RoleAdvocate,
  RolePhysician,
  type Screen,
  ScreenDay,
  ScreenHistory,
  ScreenNotes,
  ScreenPreview,
  ScreenRoom,
  ScreenWaiting,
  ShareActive,
  ShareIdle,
  VideoConnected,
  VideoIdle,
  VideoPreview,
  VideoWaiting,
  advocateFromNumber,
  applyGraph,
  callById,
  canAdmit,
  elenaFromNumber,
  guestAlexId,
  isHostSession,
  isInRoom,
  isWaiting,
  meetingById,
  meetingElenaPhoneId,
  meetingStartedOnPhone,
  openCall,
  openVideoCallFor,
  participantById,
  participantsForMeeting,
  phoneCallId,
  physicianPriyaId,
  prependTrace,
  screenMeetingId,
  seedNow,
  sessionParticipant,
} from './model.js'
import { Phone, type PhoneError } from './phone.js'
import type { AdvocacyResources } from './resources.js'
import { AdvocacyStore } from './store.js'
import { Video, type VideoError } from './video.js'

type Result = readonly [
  Model,
  ReadonlyArray<CommandModule.Command<Message, never, AdvocacyResources>>,
]

const none = (model: Model): Result => [model, []]

const isSameScreen = (left: Screen, right: Screen): boolean =>
  left._tag === right._tag &&
  Option.getOrElse(screenMeetingId(left), () => '') ===
    Option.getOrElse(screenMeetingId(right), () => '')

const navigate = (model: Model, screen: Screen): Model => {
  if (isSameScreen(model.screen, screen)) {
    return evo(model, { screen: () => screen })
  }
  return evo(model, {
    screen: () => screen,
    history: history => Array.append(history, model.screen),
  })
}

const replaceCall = (
  calls: ReadonlyArray<Call>,
  callId: string,
  next: (call: Call) => Call,
): ReadonlyArray<Call> =>
  Array.map(calls, call => (call.id === callId ? next(call) : call))

const replaceMeeting = (
  meetings: ReadonlyArray<Meeting>,
  meetingId: string,
  next: (meeting: Meeting) => Meeting,
): ReadonlyArray<Meeting> =>
  Array.map(meetings, meeting =>
    meeting.id === meetingId ? next(meeting) : meeting,
  )

const replaceParticipant = (
  participants: ReadonlyArray<Participant>,
  participantId: string,
  next: (participant: Participant) => Participant,
): ReadonlyArray<Participant> =>
  Array.map(participants, participant =>
    participant.id === participantId ? next(participant) : participant,
  )

const failPhone = (error: PhoneError) =>
  Clock.currentTimeMillis.pipe(
    Effect.map(at =>
      FailedPhone({
        operation: error.operation,
        reason: error.reason,
        at,
      }),
    ),
  )

const failVideo = (error: VideoError) =>
  Clock.currentTimeMillis.pipe(
    Effect.map(at =>
      FailedVideo({
        operation: error.operation,
        reason: error.reason,
        at,
      }),
    ),
  )

export const PlacePhone = Command.define(
  'PlacePhone',
  { meetingId: S.String, fromNumber: PhoneNumber },
  SucceededPhoneOpened,
  FailedPhone,
)(({ meetingId, fromNumber }) =>
  Effect.gen(function* () {
    const phone = yield* Phone
    const callId = id()
    const placed = yield* phone.place({ callId, fromNumber })
    return SucceededPhoneOpened({
      meetingId,
      callId: placed.callId,
      fromNumber: placed.fromNumber,
      openedAt: placed.openedAt,
    })
  }).pipe(Effect.catchTag('PhoneError', failPhone)),
)

export const WaitPhoneConnected = Command.define(
  'WaitPhoneConnected',
  { callId: S.String },
  SucceededPhoneConnected,
  FailedPhone,
)(({ callId }) =>
  Phone.pipe(
    Effect.flatMap(phone => phone.waitConnected({ callId })),
    Effect.map(connected =>
      SucceededPhoneConnected({
        callId: connected.callId,
        connectedAt: connected.connectedAt,
      }),
    ),
    Effect.catchTag('PhoneError', failPhone),
  ),
)

export const HangUpPhone = Command.define(
  'HangUpPhone',
  { callId: S.String },
  SucceededPhoneEnded,
  FailedPhone,
)(({ callId }) =>
  Phone.pipe(
    Effect.flatMap(phone => phone.hangUp({ callId })),
    Effect.map(ended =>
      SucceededPhoneEnded({
        callId: ended.callId,
        finishedAt: ended.finishedAt,
      }),
    ),
    Effect.catchTag('PhoneError', failPhone),
  ),
)

export const AnswerPhone = Command.define(
  'AnswerPhone',
  { callId: S.String },
  SucceededPhoneConnected,
  FailedPhone,
)(({ callId }) =>
  Phone.pipe(
    Effect.flatMap(phone => phone.answer({ callId })),
    Effect.map(connected =>
      SucceededPhoneConnected({
        callId: connected.callId,
        connectedAt: connected.connectedAt,
      }),
    ),
    Effect.catchTag('PhoneError', failPhone),
  ),
)

export const RingInbound = Command.define(
  'RingInbound',
  {
    meetingId: S.String,
    fromNumber: PhoneNumber,
  },
  SucceededInboundRang,
  FailedPhone,
)(({ meetingId, fromNumber }) =>
  Effect.gen(function* () {
    const phone = yield* Phone
    const callId = id()
    const rang = yield* phone.ringInbound({
      callId,
      meetingId,
      fromNumber,
    })
    return SucceededInboundRang({
      meetingId: rang.meetingId,
      callId: rang.callId,
      fromNumber: rang.fromNumber,
      openedAt: rang.openedAt,
    })
  }).pipe(Effect.catchTag('PhoneError', failPhone)),
)

export const OpenVideo = Command.define(
  'OpenVideo',
  { meetingId: S.String },
  SucceededVideoOpened,
  FailedVideo,
)(({ meetingId }) =>
  Effect.gen(function* () {
    const video = yield* Video
    const callId = id()
    const opened = yield* video.open({ meetingId, callId })
    return SucceededVideoOpened({
      meetingId: opened.meetingId,
      callId: opened.callId,
      openedAt: opened.openedAt,
      connectedAt: opened.connectedAt,
    })
  }).pipe(Effect.catchTag('VideoError', failVideo)),
)

export const LeaveVideo = Command.define(
  'LeaveVideo',
  { callId: S.String },
  SucceededVideoLeft,
  FailedVideo,
)(({ callId }) =>
  Video.pipe(
    Effect.flatMap(video => video.leave({ callId })),
    Effect.map(left =>
      SucceededVideoLeft({
        callId: left.callId,
        finishedAt: left.finishedAt,
      }),
    ),
    Effect.catchTag('VideoError', failVideo),
  ),
)

export const AdmitParticipant = Command.define(
  'AdmitParticipant',
  { participantId: S.String },
  SucceededParticipantAdmitted,
  FailedVideo,
)(({ participantId }) =>
  Video.pipe(
    Effect.flatMap(video => video.admit({ participantId })),
    Effect.map(admitted =>
      SucceededParticipantAdmitted({
        participantId: admitted.participantId,
        admittedAt: admitted.admittedAt,
      }),
    ),
    Effect.catchTag('VideoError', failVideo),
  ),
)

export const ArriveParticipant = Command.define(
  'ArriveParticipant',
  { participantId: S.String },
  SucceededParticipantArrived,
  FailedVideo,
)(({ participantId }) =>
  Video.pipe(
    Effect.flatMap(video => video.arrive({ participantId })),
    Effect.map(arrived =>
      SucceededParticipantArrived({
        participantId: arrived.participantId,
        arrivedAt: arrived.arrivedAt,
      }),
    ),
    Effect.catchTag('VideoError', failVideo),
  ),
)

export const InvitePerson = Command.define(
  'InvitePerson',
  {
    meetingId: S.String,
    personId: S.String,
    role: Role,
  },
  SucceededParticipantInvited,
  FailedVideo,
)(({ meetingId, personId, role }) =>
  Effect.gen(function* () {
    const video = yield* Video
    const participantId = id()
    const invited = yield* video.invite({ participantId })
    return SucceededParticipantInvited({
      participant: Participant.make({
        id: participantId,
        meetingId,
        personId,
        role,
        invitedAt: invited.invitedAt,
        maybeArrivedAt: Option.none(),
        maybeAdmittedAt: Option.none(),
        maybeLeftAt: Option.none(),
        maybeFailedAt: Option.none(),
      }),
    })
  }).pipe(Effect.catchTag('VideoError', failVideo)),
)

export const ArriveGuest = Command.define(
  'ArriveGuest',
  {
    meetingId: S.String,
    personId: S.String,
    role: Role,
  },
  SucceededGuestArrived,
  FailedVideo,
)(({ meetingId, personId, role }) =>
  Effect.gen(function* () {
    const video = yield* Video
    const participantId = id()
    const invited = yield* video.invite({ participantId })
    const arrived = yield* video.arrive({ participantId })
    return SucceededGuestArrived({
      participant: Participant.make({
        id: participantId,
        meetingId,
        personId,
        role,
        invitedAt: invited.invitedAt,
        maybeArrivedAt: Option.some(arrived.arrivedAt),
        maybeAdmittedAt: Option.none(),
        maybeLeftAt: Option.none(),
        maybeFailedAt: Option.none(),
      }),
    })
  }).pipe(Effect.catchTag('VideoError', failVideo)),
)

export const StartShare = Command.define(
  'StartShare',
  { meetingId: S.String },
  SucceededShareStarted,
  FailedVideo,
)(({ meetingId }) =>
  Video.pipe(
    Effect.flatMap(video => video.startShare({ meetingId })),
    Effect.map(shared =>
      SucceededShareStarted({ meetingId: shared.meetingId, at: shared.at }),
    ),
    Effect.catchTag('VideoError', failVideo),
  ),
)

export const StopShare = Command.define(
  'StopShare',
  { meetingId: S.String },
  SucceededShareStopped,
  FailedVideo,
)(({ meetingId }) =>
  Video.pipe(
    Effect.flatMap(video => video.stopShare({ meetingId })),
    Effect.map(shared =>
      SucceededShareStopped({ meetingId: shared.meetingId, at: shared.at }),
    ),
    Effect.catchTag('VideoError', failVideo),
  ),
)

export const RecordChat = Command.define(
  'RecordChat',
  {
    meetingId: S.String,
    authorId: S.String,
    text: S.String,
  },
  SucceededChatRecorded,
)(({ meetingId, authorId, text }) =>
  Effect.gen(function* () {
    const createdAt = yield* Clock.currentTimeMillis
    return SucceededChatRecorded({
      chat: Chat.make({
        id: id(),
        meetingId,
        authorId,
        createdAt,
        text,
      }),
    })
  }),
)

export const NoteRefusedVideo = Command.define(
  'NoteRefusedVideo',
  { meetingId: S.String },
  RefusedVideoAfterPhone,
)(({ meetingId }) =>
  Clock.currentTimeMillis.pipe(
    Effect.map(at => RefusedVideoAfterPhone({ meetingId, at })),
  ),
)

/** Loads one graph snapshot through the injected advocacy store. */
export const LoadGraph = Command.define(
  'LoadGraph',
  ObservedGraph,
  FailedObserveGraph,
)(
  Effect.gen(function* () {
    const store = yield* AdvocacyStore
    const snapshot = yield* store.fetch.pipe(Effect.option)
    return Option.match(snapshot, {
      onNone: () => FailedObserveGraph({ reason: 'graph failed' }),
      onSome: value =>
        ObservedGraph({
          graph: value.graph,
          source: value.source,
        }),
    })
  }),
)

/** Persists entity writes through the injected advocacy store. */
export const PersistWrites = Command.define(
  'PersistWrites',
  { writes: S.Array(Write) },
  SucceededPersist,
  FailedPersist,
)(({ writes }) =>
  AdvocacyStore.pipe(
    Effect.flatMap(store => store.transact(writes)),
    Effect.as(SucceededPersist()),
    Effect.catchTag('AdvocacyStoreError', error =>
      Effect.succeed(
        FailedPersist({
          reason: `${error.operation}: ${String(error.cause)}`,
        }),
      ),
    ),
  ),
)

/** Marks the current meeting finished at the current clock time. */
export const FinishMeeting = Command.define(
  'FinishMeeting',
  { meetingId: S.String },
  SucceededMeetingFinished,
)(({ meetingId }) =>
  Clock.currentTimeMillis.pipe(
    Effect.map(finishedAt =>
      SucceededMeetingFinished({ meetingId, finishedAt }),
    ),
  ),
)

/** Opens an unscheduled meeting hosted by the current session person. */
export const StartImpromptu = Command.define(
  'StartImpromptu',
  { personId: S.String },
  SucceededImpromptuStarted,
)(({ personId }) =>
  Clock.currentTimeMillis.pipe(
    Effect.map(createdAt => {
      const meetingId = id()
      return SucceededImpromptuStarted({
        meeting: Meeting.make({
          id: meetingId,
          createdAt,
          maybePatientId: Option.none(),
          origin: OriginImpromptu(),
          notes: '',
          maybeCanceledAt: Option.none(),
          maybeFinishedAt: Option.none(),
        }),
        participant: Participant.make({
          id: id(),
          meetingId,
          personId,
          role: RoleAdvocate(),
          invitedAt: createdAt,
          maybeArrivedAt: Option.some(createdAt),
          maybeAdmittedAt: Option.some(createdAt),
          maybeLeftAt: Option.none(),
          maybeFailedAt: Option.none(),
        }),
      })
    }),
  ),
)

const queuePersist = (
  model: Model,
  writes: ReadonlyArray<Write>,
  extra: ReadonlyArray<
    CommandModule.Command<Message, never, AdvocacyResources>
  > = [],
): Result =>
  Array.match(writes, {
    onEmpty: () => [model, extra],
    onNonEmpty: nonempty => [
      model,
      [...extra, PersistWrites({ writes: nonempty })],
    ],
  })

const enterRoom = (model: Model, meetingId: string): Model =>
  evo(navigate(model, ScreenRoom({ meetingId })), {
    video: () => VideoConnected({ meetingId, share: ShareIdle() }),
  })

const joinExistingOrOpenVideo = (model: Model, meetingId: string): Result => {
  if (meetingStartedOnPhone(model.calls, meetingId)) {
    return [model, [NoteRefusedVideo({ meetingId })]]
  }
  return Option.match(openVideoCallFor(model.calls, meetingId), {
    onSome: () => none(enterRoom(model, meetingId)),
    onNone: () => [model, [OpenVideo({ meetingId })]],
  })
}

const observeGraph = (
  model: Model,
  graph: Graph,
  source: 'Instant' | 'StaticFallback',
): Result => {
  const next = evo(applyGraph(model, graph), {
    source: () => source,
  })
  if (next.screen._tag !== 'ScreenWaiting') {
    return none(next)
  }
  const meetingId = next.screen.meetingId
  const maybeMine = sessionParticipant(next, meetingId)
  if (!Option.exists(maybeMine, isInRoom)) {
    return none(next)
  }
  if (
    next.video._tag === 'VideoConnected' &&
    next.video.meetingId === meetingId
  ) {
    return none(enterRoom(next, meetingId))
  }
  return joinExistingOrOpenVideo(next, meetingId)
}

const hangUpCurrent = (model: Model): Result =>
  Option.match(phoneCallId(model.phone), {
    onNone: () => none(model),
    onSome: callId => [model, [HangUpPhone({ callId })]],
  })

export const update = (model: Model, message: Message): Result =>
  M.value(message).pipe(
    M.withReturnType<Result>(),
    M.tagsExhaustive({
      ClickedOpenDay: () => none(navigate(model, ScreenDay())),
      ClickedOpenHistory: () => none(navigate(model, ScreenHistory())),
      ClickedGoBack: () =>
        Option.match(Array.last(model.history), {
          onNone: () => none(navigate(model, ScreenDay())),
          onSome: screen => [
            evo(model, {
              screen: () => screen,
              history: () => Array.dropRight(model.history, 1),
              video: video =>
                video._tag === 'VideoPreview' || video._tag === 'VideoWaiting'
                  ? VideoIdle()
                  : video,
            }),
            [],
          ],
        }),
      ClickedOpenMeeting: ({ meetingId }) =>
        Option.match(meetingById(model.meetings, meetingId), {
          onNone: () => none(model),
          onSome: meeting => {
            if (Option.isSome(meeting.maybeFinishedAt)) {
              return none(navigate(model, ScreenNotes({ meetingId })))
            }
            if (
              model.video._tag === 'VideoConnected' &&
              model.video.meetingId === meetingId
            ) {
              return none(navigate(model, ScreenRoom({ meetingId })))
            }
            if (!isHostSession(model, meetingId)) {
              return [
                evo(navigate(model, ScreenWaiting({ meetingId })), {
                  video: () => VideoWaiting({ meetingId }),
                }),
                [],
              ]
            }
            const isPhonePreferred = M.value(meeting.origin).pipe(
              M.tagsExhaustive({
                OriginImpromptu: () => false,
                OriginScheduled: ({ preferred }) =>
                  M.value(preferred).pipe(
                    M.tagsExhaustive({
                      PreferredPhone: () => true,
                      PreferredVideo: () => false,
                    }),
                  ),
              }),
            )
            if (isPhonePreferred) {
              if (model.phone._tag !== 'PhoneIdle') {
                return none(model)
              }
              return [
                model,
                [
                  PlacePhone({
                    meetingId,
                    fromNumber: advocateFromNumber,
                  }),
                ],
              ]
            }
            return [
              evo(navigate(model, ScreenPreview({ meetingId })), {
                video: () => VideoPreview({ meetingId }),
              }),
              [],
            ]
          },
        }),
      ClickedOpenNotes: ({ meetingId }) =>
        none(navigate(model, ScreenNotes({ meetingId }))),
      ClickedJoinVideo: ({ meetingId }) => {
        if (
          model.phone._tag !== 'PhoneIdle' &&
          model.phone._tag !== 'PhoneConnected'
        ) {
          return none(model)
        }
        return joinExistingOrOpenVideo(model, meetingId)
      },
      ClickedLeaveVideo: () =>
        Option.match(screenMeetingId(model.screen), {
          onNone: () => none(model),
          onSome: meetingId =>
            Option.match(openVideoCallFor(model.calls, meetingId), {
              onNone: () => [
                evo(navigate(model, ScreenDay()), {
                  video: () => VideoIdle(),
                  draft: () => '',
                }),
                [],
              ],
              onSome: call => [model, [LeaveVideo({ callId: call.id })]],
            }),
        }),
      ClickedPlacePhone: ({ meetingId }) => {
        if (model.phone._tag !== 'PhoneIdle') {
          return none(model)
        }
        return [
          model,
          [PlacePhone({ meetingId, fromNumber: advocateFromNumber })],
        ]
      },
      ClickedHangUpPhone: () => hangUpCurrent(model),
      ClickedAnswerPhone: () => {
        if (model.phone._tag !== 'PhoneRinging') {
          return none(model)
        }
        return [model, [AnswerPhone({ callId: model.phone.callId })]]
      },
      ClickedDeclinePhone: () => {
        if (model.phone._tag !== 'PhoneRinging') {
          return none(model)
        }
        return hangUpCurrent(model)
      },
      ClickedSimulateInbound: () => {
        if (model.phone._tag !== 'PhoneIdle') {
          return none(model)
        }
        return [
          model,
          [
            RingInbound({
              meetingId: meetingElenaPhoneId,
              fromNumber: elenaFromNumber,
            }),
          ],
        ]
      },
      ClickedAdmit: ({ participantId }) =>
        Option.match(participantById(model.participants, participantId), {
          onNone: () => none(model),
          onSome: participant => {
            if (!isWaiting(participant)) {
              return none(model)
            }
            if (!canAdmit(model, participant.meetingId)) {
              return none(model)
            }
            return [model, [AdmitParticipant({ participantId })]]
          },
        }),
      ClickedInvitePhysician: ({ meetingId }) => {
        const maybeRow = Array.findFirst(
          participantsForMeeting(model.participants, meetingId),
          row => row.personId === physicianPriyaId,
        )
        return Option.match(maybeRow, {
          onNone: () => [
            model,
            [
              InvitePerson({
                meetingId,
                personId: physicianPriyaId,
                role: RolePhysician(),
              }),
            ],
          ],
          onSome: row => {
            if (Option.isSome(row.maybeArrivedAt)) {
              return none(model)
            }
            return [model, [ArriveParticipant({ participantId: row.id })]]
          },
        })
      },
      ClickedSimulateGuestWaiting: ({ meetingId }) => {
        const maybeRow = Array.findFirst(
          participantsForMeeting(model.participants, meetingId),
          row => row.personId === guestAlexId,
        )
        return Option.match(maybeRow, {
          onNone: () => [
            model,
            [
              ArriveGuest({
                meetingId,
                personId: guestAlexId,
                role: RoleAdvocate(),
              }),
            ],
          ],
          onSome: row => {
            if (Option.isSome(row.maybeArrivedAt)) {
              return none(model)
            }
            return [model, [ArriveParticipant({ participantId: row.id })]]
          },
        })
      },
      ClickedStartShare: () => {
        if (model.video._tag !== 'VideoConnected') {
          return none(model)
        }
        if (model.video.share._tag === 'ShareActive') {
          return none(model)
        }
        return [model, [StartShare({ meetingId: model.video.meetingId })]]
      },
      ClickedStopShare: () => {
        if (model.video._tag !== 'VideoConnected') {
          return none(model)
        }
        if (model.video.share._tag !== 'ShareActive') {
          return none(model)
        }
        return [model, [StopShare({ meetingId: model.video.meetingId })]]
      },
      UpdatedDraft: ({ value }) => [evo(model, { draft: () => value }), []],
      ClickedSendChat: () => {
        const text = model.draft.trim()
        if (text === '') {
          return none(model)
        }
        if (model.screen._tag !== 'ScreenRoom') {
          return none(model)
        }
        return [
          model,
          [
            RecordChat({
              meetingId: model.screen.meetingId,
              authorId: model.sessionPersonId,
              text,
            }),
          ],
        ]
      },
      ClickedSwitchPerson: ({ personId }) =>
        none(
          evo(navigate(model, ScreenDay()), {
            sessionPersonId: () => personId,
            video: () => VideoIdle(),
            phone: () => PhoneIdle(),
            draft: () => '',
          }),
        ),
      ClickedToggleCaptions: () => [
        evo(model, { isCaptionsOn: isCaptionsOn => !isCaptionsOn }),
        [],
      ],
      ClickedFinishMeeting: () =>
        Option.match(screenMeetingId(model.screen), {
          onNone: () => none(model),
          onSome: meetingId => {
            if (!isHostSession(model, meetingId)) {
              return none(model)
            }
            return [model, [FinishMeeting({ meetingId })]]
          },
        }),
      UpdatedNotes: ({ value }) =>
        Option.match(screenMeetingId(model.screen), {
          onNone: () => none(model),
          onSome: meetingId =>
            Option.match(meetingById(model.meetings, meetingId), {
              onNone: () => none(model),
              onSome: meeting => {
                const nextMeeting = evo(meeting, { notes: () => value })
                return queuePersist(
                  evo(model, {
                    meetings: meetings =>
                      replaceMeeting(meetings, meetingId, () => nextMeeting),
                  }),
                  [WriteMeeting({ meeting: nextMeeting })],
                )
              },
            }),
        }),
      ClickedStartImpromptu: () => [
        model,
        [StartImpromptu({ personId: model.sessionPersonId })],
      ],
      ClickedArrive: ({ meetingId }) =>
        Option.match(sessionParticipant(model, meetingId), {
          onNone: () => [
            model,
            [
              ArriveGuest({
                meetingId,
                personId: model.sessionPersonId,
                role: RoleAdvocate(),
              }),
            ],
          ],
          onSome: participant => {
            if (Option.isSome(participant.maybeArrivedAt)) {
              return none(model)
            }
            return [
              model,
              [ArriveParticipant({ participantId: participant.id })],
            ]
          },
        }),
      SucceededPhoneOpened: ({ meetingId, callId, fromNumber, openedAt }) => {
        const call = Call.make({
          id: callId,
          meetingId,
          openedAt,
          maybeConnectedAt: Option.none(),
          maybeFinishedAt: Option.none(),
          kind: KindPhone({ fromNumber }),
        })
        return queuePersist(
          evo(model, {
            calls: calls => Array.append(calls, call),
            phone: () => PhoneDialing({ callId }),
            trace: trace =>
              prependTrace(trace, openedAt, `Phone dialing ${fromNumber}`),
          }),
          [WriteCall({ call })],
          [WaitPhoneConnected({ callId })],
        )
      },
      SucceededPhoneConnected: ({ callId, connectedAt }) => {
        if (
          model.phone._tag !== 'PhoneDialing' &&
          model.phone._tag !== 'PhoneRinging'
        ) {
          return none(model)
        }
        if (model.phone.callId !== callId) {
          return none(model)
        }
        return Option.match(callById(model.calls, callId), {
          onNone: () => none(model),
          onSome: call => {
            const nextCall = evo(call, {
              maybeConnectedAt: () => Option.some(connectedAt),
            })
            return queuePersist(
              evo(model, {
                calls: calls => replaceCall(calls, callId, () => nextCall),
                phone: () => PhoneConnected({ callId }),
                trace: trace =>
                  prependTrace(trace, connectedAt, 'Phone connected'),
              }),
              [WriteCall({ call: nextCall })],
            )
          },
        })
      },
      SucceededPhoneEnded: ({ callId, finishedAt }) =>
        Option.match(callById(model.calls, callId), {
          onNone: () =>
            none(
              evo(model, {
                phone: () => PhoneIdle(),
                trace: trace => prependTrace(trace, finishedAt, 'Phone ended'),
              }),
            ),
          onSome: call => {
            const nextCall = evo(call, {
              maybeFinishedAt: () => Option.some(finishedAt),
            })
            return queuePersist(
              evo(model, {
                calls: calls => replaceCall(calls, callId, () => nextCall),
                phone: () => PhoneIdle(),
                trace: trace => prependTrace(trace, finishedAt, 'Phone ended'),
              }),
              [WriteCall({ call: nextCall })],
            )
          },
        }),
      SucceededInboundRang: ({ meetingId, callId, fromNumber, openedAt }) => {
        const call = Call.make({
          id: callId,
          meetingId,
          openedAt,
          maybeConnectedAt: Option.none(),
          maybeFinishedAt: Option.none(),
          kind: KindPhone({ fromNumber }),
        })
        return queuePersist(
          evo(model, {
            calls: calls => Array.append(calls, call),
            phone: () => PhoneRinging({ callId }),
            trace: trace =>
              prependTrace(trace, openedAt, `Inbound from ${fromNumber}`),
          }),
          [WriteCall({ call })],
        )
      },
      FailedPhone: ({ operation, reason, at }) => [
        evo(model, {
          trace: trace =>
            prependTrace(trace, at, `Phone ${operation} failed: ${reason}`),
        }),
        [],
      ],
      SucceededVideoOpened: ({ meetingId, callId, openedAt, connectedAt }) => {
        const call = Call.make({
          id: callId,
          meetingId,
          openedAt,
          maybeConnectedAt: Option.some(connectedAt),
          maybeFinishedAt: Option.none(),
          kind: KindVideo(),
        })
        return queuePersist(
          evo(navigate(model, ScreenRoom({ meetingId })), {
            calls: calls => Array.append(calls, call),
            video: () => VideoConnected({ meetingId, share: ShareIdle() }),
            trace: trace => prependTrace(trace, connectedAt, 'Video connected'),
          }),
          [WriteCall({ call })],
        )
      },
      SucceededVideoLeft: ({ callId, finishedAt }) =>
        Option.match(callById(model.calls, callId), {
          onNone: () =>
            none(
              evo(navigate(model, ScreenDay()), {
                video: () => VideoIdle(),
                draft: () => '',
                trace: trace => prependTrace(trace, finishedAt, 'Video left'),
              }),
            ),
          onSome: call => {
            const nextCall = evo(call, {
              maybeFinishedAt: () => Option.some(finishedAt),
            })
            return queuePersist(
              evo(navigate(model, ScreenDay()), {
                calls: calls => replaceCall(calls, callId, () => nextCall),
                video: () => VideoIdle(),
                draft: () => '',
                trace: trace => prependTrace(trace, finishedAt, 'Video left'),
              }),
              [WriteCall({ call: nextCall })],
            )
          },
        }),
      SucceededParticipantAdmitted: ({ participantId, admittedAt }) =>
        Option.match(participantById(model.participants, participantId), {
          onNone: () => none(model),
          onSome: participant => {
            const nextParticipant = evo(participant, {
              maybeAdmittedAt: () => Option.some(admittedAt),
            })
            return queuePersist(
              evo(model, {
                participants: participants =>
                  replaceParticipant(
                    participants,
                    participantId,
                    () => nextParticipant,
                  ),
                trace: trace =>
                  prependTrace(trace, admittedAt, 'Participant admitted'),
              }),
              [WriteParticipant({ participant: nextParticipant })],
            )
          },
        }),
      SucceededParticipantArrived: ({ participantId, arrivedAt }) =>
        Option.match(participantById(model.participants, participantId), {
          onNone: () => none(model),
          onSome: participant => {
            const nextParticipant = evo(participant, {
              maybeArrivedAt: () => Option.some(arrivedAt),
            })
            return queuePersist(
              evo(model, {
                participants: participants =>
                  replaceParticipant(
                    participants,
                    participantId,
                    () => nextParticipant,
                  ),
                trace: trace =>
                  prependTrace(trace, arrivedAt, 'Participant in waiting room'),
              }),
              [WriteParticipant({ participant: nextParticipant })],
            )
          },
        }),
      SucceededGuestArrived: ({ participant }) =>
        queuePersist(
          evo(model, {
            participants: participants =>
              Array.append(participants, participant),
            trace: trace =>
              prependTrace(
                trace,
                Option.getOrElse(
                  participant.maybeArrivedAt,
                  () => participant.invitedAt,
                ),
                'Guest in waiting room',
              ),
          }),
          [WriteParticipant({ participant })],
        ),
      SucceededParticipantInvited: ({ participant }) =>
        queuePersist(
          evo(model, {
            participants: participants =>
              Array.append(participants, participant),
            trace: trace =>
              prependTrace(trace, participant.invitedAt, 'Participant invited'),
          }),
          [WriteParticipant({ participant })],
        ),
      SucceededShareStarted: ({ meetingId, at }) => {
        if (model.video._tag !== 'VideoConnected') {
          return none(model)
        }
        if (model.video.meetingId !== meetingId) {
          return none(model)
        }
        return [
          evo(model, {
            video: () => VideoConnected({ meetingId, share: ShareActive() }),
            trace: trace => prependTrace(trace, at, 'Screen share started'),
          }),
          [],
        ]
      },
      SucceededShareStopped: ({ meetingId, at }) => {
        if (model.video._tag !== 'VideoConnected') {
          return none(model)
        }
        if (model.video.meetingId !== meetingId) {
          return none(model)
        }
        return [
          evo(model, {
            video: () => VideoConnected({ meetingId, share: ShareIdle() }),
            trace: trace => prependTrace(trace, at, 'Screen share stopped'),
          }),
          [],
        ]
      },
      FailedVideo: ({ operation, reason, at }) => [
        evo(model, {
          trace: trace =>
            prependTrace(trace, at, `Video ${operation} failed: ${reason}`),
        }),
        [],
      ],
      SucceededChatRecorded: ({ chat }) =>
        queuePersist(
          evo(model, {
            chats: chats => Array.append(chats, chat),
            draft: () => '',
          }),
          [WriteChat({ chat })],
        ),
      RefusedVideoAfterPhone: ({ at }) => [
        evo(model, {
          trace: trace =>
            prependTrace(
              trace,
              at,
              'Video is not allowed after a phone-started meeting',
            ),
        }),
        [],
      ],
      ObservedGraph: ({ graph, source }) => observeGraph(model, graph, source),
      FailedObserveGraph: ({ reason }) => [
        evo(model, {
          source: () => 'StaticFallback',
          trace: trace =>
            prependTrace(trace, seedNow, `Graph observe failed: ${reason}`),
        }),
        [],
      ],
      SucceededPersist: () => none(model),
      FailedPersist: ({ reason }) => [
        evo(model, {
          trace: trace =>
            prependTrace(trace, seedNow, `Persist failed: ${reason}`),
        }),
        [],
      ],
      SucceededMeetingFinished: ({ meetingId, finishedAt }) =>
        Option.match(meetingById(model.meetings, meetingId), {
          onNone: () => none(model),
          onSome: meeting => {
            const nextMeeting = evo(meeting, {
              maybeFinishedAt: () => Option.some(finishedAt),
            })
            const nextCalls = Array.map(model.calls, call => {
              if (call.meetingId !== meetingId) {
                return call
              }
              if (!openCall(call)) {
                return call
              }
              return evo(call, {
                maybeFinishedAt: () => Option.some(finishedAt),
              })
            })
            const callWrites = Array.map(
              Array.filter(
                nextCalls,
                call =>
                  call.meetingId === meetingId &&
                  Option.exists(
                    call.maybeFinishedAt,
                    value => value === finishedAt,
                  ),
              ),
              call => WriteCall({ call }),
            )
            return queuePersist(
              evo(navigate(model, ScreenNotes({ meetingId })), {
                meetings: () =>
                  replaceMeeting(model.meetings, meetingId, () => nextMeeting),
                calls: () => nextCalls,
                video: () => VideoIdle(),
                phone: () => PhoneIdle(),
                draft: () => '',
                trace: trace =>
                  prependTrace(trace, finishedAt, 'Meeting finished'),
              }),
              [WriteMeeting({ meeting: nextMeeting }), ...callWrites],
            )
          },
        }),
      SucceededImpromptuStarted: ({ meeting, participant }) =>
        queuePersist(
          evo(navigate(model, ScreenPreview({ meetingId: meeting.id })), {
            meetings: meetings => Array.append(meetings, meeting),
            participants: participants =>
              Array.append(participants, participant),
            video: () => VideoPreview({ meetingId: meeting.id }),
            trace: trace =>
              prependTrace(
                trace,
                meeting.createdAt,
                'Impromptu meeting started',
              ),
          }),
          [WriteMeeting({ meeting }), WriteParticipant({ participant })],
        ),
    }),
  )
