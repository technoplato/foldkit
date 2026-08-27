import { Array, Match as M, Option, Order, Schema as S } from 'effect'
import { NonEmptyString } from 'foldkit/adt'
import { ts } from 'foldkit/schema'
import { evo } from 'foldkit/struct'

export const seedNow = Date.UTC(2026, 7, 13, 16, 0, 0)
export const sessionPersonId = '11111111-1111-4111-8111-111111111111'
/** A non-empty phone number. `""` is not a value. */
export const PhoneNumber = NonEmptyString
/** A non-empty phone number. `""` is not a value. */
export type PhoneNumber = typeof PhoneNumber.Type

export const advocateFromNumber = PhoneNumber.make('+15550100')
export const elenaFromNumber = PhoneNumber.make('+15550199')

export const advocateJordanId = '11111111-1111-4111-8111-111111111111'
export const physicianPriyaId = '22222222-2222-4222-8222-222222222222'
export const patientSamId = '33333333-3333-4333-8333-333333333333'
export const patientElenaId = '44444444-4444-4444-8444-444444444444'
export const guestAlexId = '55555555-5555-4555-8555-555555555555'

export const meetingSamVideoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
export const meetingElenaPhoneId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
export const meetingSamPastId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
export const callSamPastId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
export const participantSamWaitingId = 'e3333333-3333-4333-8333-333333333333'
export const participantPriyaInvitedId = 'e2222222-2222-4222-8222-222222222222'
export const participantAlexId = 'e8888888-8888-4888-8888-888888888888'

export const Person = S.Struct({
  id: S.String,
  name: S.String,
})
export type Person = typeof Person.Type

export const RoleAdvocate = ts('RoleAdvocate')
export const RolePhysician = ts('RolePhysician')
export const RolePatient = ts('RolePatient')
export const Role = S.Union([RoleAdvocate, RolePhysician, RolePatient])
export type Role = typeof Role.Type

export const PreferredPhone = ts('PreferredPhone')
export const PreferredVideo = ts('PreferredVideo')
export const Preferred = S.Union([PreferredPhone, PreferredVideo])
export type Preferred = typeof Preferred.Type

export const Times = S.Struct({
  wall: S.Struct({
    start: S.Number,
    end: S.Number,
  }),
  relative: S.Struct({
    start: S.Number,
    end: S.Number,
  }),
})
export type Times = typeof Times.Type

export const OriginScheduled = ts('OriginScheduled', {
  times: Times,
  preferred: Preferred,
})
export const OriginImpromptu = ts('OriginImpromptu')
export const Origin = S.Union([OriginScheduled, OriginImpromptu])
export type Origin = typeof Origin.Type

export const Meeting = S.Struct({
  id: S.String,
  createdAt: S.Number,
  maybePatientId: S.Option(S.String),
  origin: Origin,
  notes: S.String,
  maybeCanceledAt: S.Option(S.Number),
  maybeFinishedAt: S.Option(S.Number),
})
export type Meeting = typeof Meeting.Type

export const KindPhone = ts('KindPhone', { fromNumber: PhoneNumber })
export const KindVideo = ts('KindVideo')
export const Kind = S.Union([KindPhone, KindVideo])
export type Kind = typeof Kind.Type

export const Call = S.Struct({
  id: S.String,
  meetingId: S.String,
  openedAt: S.Number,
  maybeConnectedAt: S.Option(S.Number),
  maybeFinishedAt: S.Option(S.Number),
  kind: Kind,
})
export type Call = typeof Call.Type

export const Participant = S.Struct({
  id: S.String,
  meetingId: S.String,
  personId: S.String,
  role: Role,
  invitedAt: S.Number,
  maybeArrivedAt: S.Option(S.Number),
  maybeAdmittedAt: S.Option(S.Number),
  maybeLeftAt: S.Option(S.Number),
  maybeFailedAt: S.Option(S.Number),
})
export type Participant = typeof Participant.Type

export const Chat = S.Struct({
  id: S.String,
  meetingId: S.String,
  authorId: S.String,
  createdAt: S.Number,
  text: S.String,
})
export type Chat = typeof Chat.Type

export const Segment = S.Struct({
  id: S.String,
  callId: S.String,
  index: S.Number,
  createdAt: S.Number,
  text: S.String,
})
export type Segment = typeof Segment.Type

export const ScreenDay = ts('ScreenDay')
export const ScreenHistory = ts('ScreenHistory')
export const ScreenPreview = ts('ScreenPreview', { meetingId: S.String })
export const ScreenWaiting = ts('ScreenWaiting', { meetingId: S.String })
export const ScreenRoom = ts('ScreenRoom', { meetingId: S.String })
export const ScreenNotes = ts('ScreenNotes', { meetingId: S.String })
export const Screen = S.Union([
  ScreenDay,
  ScreenHistory,
  ScreenPreview,
  ScreenWaiting,
  ScreenRoom,
  ScreenNotes,
])
export type Screen = typeof Screen.Type

export const PhoneIdle = ts('PhoneIdle')
export const PhoneDialing = ts('PhoneDialing', { callId: S.String })
export const PhoneRinging = ts('PhoneRinging', { callId: S.String })
export const PhoneConnected = ts('PhoneConnected', { callId: S.String })
export const PhonePhase = S.Union([
  PhoneIdle,
  PhoneDialing,
  PhoneRinging,
  PhoneConnected,
])
export type PhonePhase = typeof PhonePhase.Type

export const ShareIdle = ts('ShareIdle')
export const ShareActive = ts('ShareActive')
export const Share = S.Union([ShareIdle, ShareActive])
export type Share = typeof Share.Type

export const VideoIdle = ts('VideoIdle')
export const VideoPreview = ts('VideoPreview', { meetingId: S.String })
export const VideoWaiting = ts('VideoWaiting', { meetingId: S.String })
export const VideoConnected = ts('VideoConnected', {
  meetingId: S.String,
  share: Share,
})
export const VideoPhase = S.Union([
  VideoIdle,
  VideoPreview,
  VideoWaiting,
  VideoConnected,
])
export type VideoPhase = typeof VideoPhase.Type

export const Trace = S.Struct({
  at: S.Number,
  label: S.String,
})
export type Trace = typeof Trace.Type

export const Graph = S.Struct({
  people: S.Array(Person),
  meetings: S.Array(Meeting),
  calls: S.Array(Call),
  participants: S.Array(Participant),
  chats: S.Array(Chat),
  segments: S.Array(Segment),
})
export type Graph = typeof Graph.Type

export const Model = S.Struct({
  sessionPersonId: S.String,
  people: S.Array(Person),
  meetings: S.Array(Meeting),
  calls: S.Array(Call),
  participants: S.Array(Participant),
  chats: S.Array(Chat),
  segments: S.Array(Segment),
  screen: Screen,
  history: S.Array(Screen),
  phone: PhonePhase,
  video: VideoPhase,
  draft: S.String,
  isCaptionsOn: S.Boolean,
  source: S.Literals(['Instant', 'StaticFallback']),
  trace: S.Array(Trace),
})
export type Model = typeof Model.Type

const samVideoStart = Date.UTC(2026, 7, 13, 15, 0, 0)
const samVideoEnd = Date.UTC(2026, 7, 13, 15, 30, 0)
const elenaPhoneStart = Date.UTC(2026, 7, 13, 18, 0, 0)
const elenaPhoneEnd = Date.UTC(2026, 7, 13, 18, 20, 0)
const samPastStart = Date.UTC(2026, 7, 12, 15, 0, 0)
const samPastEnd = Date.UTC(2026, 7, 12, 15, 18, 0)
const samPastOpened = Date.UTC(2026, 7, 12, 15, 1, 0)
const samPastConnected = Date.UTC(2026, 7, 12, 15, 1, 40)
const samPastFinished = Date.UTC(2026, 7, 12, 15, 16, 0)

const scheduled = (start: number, end: number, preferred: Preferred): Origin =>
  OriginScheduled({
    times: Times.make({
      wall: { start, end },
      relative: { start: 0, end: end - start },
    }),
    preferred,
  })

export const seedPeople: ReadonlyArray<Person> = [
  Person.make({ id: advocateJordanId, name: 'Jordan Hale' }),
  Person.make({ id: physicianPriyaId, name: 'Dr. Priya Shah' }),
  Person.make({ id: patientSamId, name: 'Sam Ortiz' }),
  Person.make({ id: patientElenaId, name: 'Elena Cho' }),
  Person.make({ id: guestAlexId, name: 'Alex Rivera' }),
]

export const seedMeetings: ReadonlyArray<Meeting> = [
  Meeting.make({
    id: meetingSamVideoId,
    createdAt: Date.UTC(2026, 7, 12, 20, 0, 0),
    maybePatientId: Option.some(patientSamId),
    origin: scheduled(samVideoStart, samVideoEnd, PreferredVideo()),
    notes: '',
    maybeCanceledAt: Option.none(),
    maybeFinishedAt: Option.none(),
  }),
  Meeting.make({
    id: meetingElenaPhoneId,
    createdAt: Date.UTC(2026, 7, 13, 12, 0, 0),
    maybePatientId: Option.some(patientElenaId),
    origin: scheduled(elenaPhoneStart, elenaPhoneEnd, PreferredPhone()),
    notes: '',
    maybeCanceledAt: Option.none(),
    maybeFinishedAt: Option.none(),
  }),
  Meeting.make({
    id: meetingSamPastId,
    createdAt: Date.UTC(2026, 7, 11, 18, 0, 0),
    maybePatientId: Option.some(patientSamId),
    origin: scheduled(samPastStart, samPastEnd, PreferredPhone()),
    notes: 'Follow up on the specialist letter before Friday.',
    maybeCanceledAt: Option.none(),
    maybeFinishedAt: Option.some(samPastFinished),
  }),
]

export const seedCalls: ReadonlyArray<Call> = [
  Call.make({
    id: callSamPastId,
    meetingId: meetingSamPastId,
    openedAt: samPastOpened,
    maybeConnectedAt: Option.some(samPastConnected),
    maybeFinishedAt: Option.some(samPastFinished),
    kind: KindPhone({ fromNumber: advocateFromNumber }),
  }),
]

const hostAdvocate = (
  id: string,
  meetingId: string,
  invitedAt: number,
): Participant =>
  Participant.make({
    id,
    meetingId,
    personId: advocateJordanId,
    role: RoleAdvocate(),
    invitedAt,
    maybeArrivedAt: Option.some(invitedAt),
    maybeAdmittedAt: Option.some(invitedAt),
    maybeLeftAt: Option.none(),
    maybeFailedAt: Option.none(),
  })

export const seedParticipants: ReadonlyArray<Participant> = [
  hostAdvocate(
    'e1111111-1111-4111-8111-111111111111',
    meetingSamVideoId,
    samVideoStart,
  ),
  Participant.make({
    id: participantPriyaInvitedId,
    meetingId: meetingSamVideoId,
    personId: physicianPriyaId,
    role: RolePhysician(),
    invitedAt: samVideoStart,
    maybeArrivedAt: Option.none(),
    maybeAdmittedAt: Option.none(),
    maybeLeftAt: Option.none(),
    maybeFailedAt: Option.none(),
  }),
  Participant.make({
    id: participantSamWaitingId,
    meetingId: meetingSamVideoId,
    personId: patientSamId,
    role: RolePatient(),
    invitedAt: samVideoStart,
    maybeArrivedAt: Option.some(seedNow - 4 * 60 * 1000),
    maybeAdmittedAt: Option.none(),
    maybeLeftAt: Option.none(),
    maybeFailedAt: Option.none(),
  }),
  hostAdvocate(
    'e4444444-4444-4444-8444-444444444444',
    meetingElenaPhoneId,
    elenaPhoneStart,
  ),
  Participant.make({
    id: 'e5555555-5555-4555-8555-555555555555',
    meetingId: meetingElenaPhoneId,
    personId: patientElenaId,
    role: RolePatient(),
    invitedAt: elenaPhoneStart,
    maybeArrivedAt: Option.none(),
    maybeAdmittedAt: Option.none(),
    maybeLeftAt: Option.none(),
    maybeFailedAt: Option.none(),
  }),
  hostAdvocate(
    'e6666666-6666-4666-8666-666666666666',
    meetingSamPastId,
    samPastStart,
  ),
  Participant.make({
    id: 'e7777777-7777-4777-8777-777777777777',
    meetingId: meetingSamPastId,
    personId: patientSamId,
    role: RolePatient(),
    invitedAt: samPastStart,
    maybeArrivedAt: Option.some(samPastOpened),
    maybeAdmittedAt: Option.some(samPastConnected),
    maybeLeftAt: Option.some(samPastFinished),
    maybeFailedAt: Option.none(),
  }),
]

export const seedSegments: ReadonlyArray<Segment> = [
  Segment.make({
    id: 'f0000000-0000-4000-8000-000000000001',
    callId: callSamPastId,
    index: 0,
    createdAt: samPastConnected + 20_000,
    text: 'Hi Sam, it is Jordan from advocacy.',
  }),
  Segment.make({
    id: 'f0000000-0000-4000-8000-000000000002',
    callId: callSamPastId,
    index: 1,
    createdAt: samPastConnected + 50_000,
    text: 'Thanks for calling. The specialist letter still has not arrived.',
  }),
]

export const seedGraph: Graph = Graph.make({
  people: seedPeople,
  meetings: seedMeetings,
  calls: seedCalls,
  participants: seedParticipants,
  chats: [],
  segments: seedSegments,
})

export const initialModel: Model = Model.make({
  sessionPersonId,
  people: seedPeople,
  meetings: seedMeetings,
  calls: seedCalls,
  participants: seedParticipants,
  chats: [],
  segments: seedSegments,
  screen: ScreenDay(),
  history: [],
  phone: PhoneIdle(),
  video: VideoIdle(),
  draft: '',
  isCaptionsOn: false,
  source: 'StaticFallback',
  trace: [],
})

export const personById = (
  people: ReadonlyArray<Person>,
  personId: string,
): Option.Option<Person> =>
  Array.findFirst(people, person => person.id === personId)

export const meetingById = (
  meetings: ReadonlyArray<Meeting>,
  meetingId: string,
): Option.Option<Meeting> =>
  Array.findFirst(meetings, meeting => meeting.id === meetingId)

export const callById = (
  calls: ReadonlyArray<Call>,
  callId: string,
): Option.Option<Call> => Array.findFirst(calls, call => call.id === callId)

export const participantById = (
  participants: ReadonlyArray<Participant>,
  participantId: string,
): Option.Option<Participant> =>
  Array.findFirst(participants, participant => participant.id === participantId)

export const personName = (
  people: ReadonlyArray<Person>,
  personId: string,
): string =>
  Option.match(personById(people, personId), {
    onNone: () => 'Unknown',
    onSome: person => person.name,
  })

export const isWaiting = (participant: Participant): boolean =>
  Option.isSome(participant.maybeArrivedAt) &&
  Option.isNone(participant.maybeAdmittedAt) &&
  Option.isNone(participant.maybeLeftAt)

export const isInRoom = (participant: Participant): boolean =>
  Option.isSome(participant.maybeAdmittedAt) &&
  Option.isNone(participant.maybeLeftAt)

export const participantsForMeeting = (
  participants: ReadonlyArray<Participant>,
  meetingId: string,
): ReadonlyArray<Participant> =>
  Array.filter(participants, participant => participant.meetingId === meetingId)

export const waitingForMeeting = (
  participants: ReadonlyArray<Participant>,
  meetingId: string,
): ReadonlyArray<Participant> =>
  Array.filter(participantsForMeeting(participants, meetingId), isWaiting)

export const inRoomForMeeting = (
  participants: ReadonlyArray<Participant>,
  meetingId: string,
): ReadonlyArray<Participant> =>
  Array.filter(participantsForMeeting(participants, meetingId), isInRoom)

export const callsForMeeting = (
  calls: ReadonlyArray<Call>,
  meetingId: string,
): ReadonlyArray<Call> =>
  Array.filter(calls, call => call.meetingId === meetingId)

export const chatsForMeeting = (
  chats: ReadonlyArray<Chat>,
  meetingId: string,
): ReadonlyArray<Chat> =>
  Array.filter(chats, chat => chat.meetingId === meetingId)

export const firstCall = (
  calls: ReadonlyArray<Call>,
  meetingId: string,
): Option.Option<Call> =>
  Array.head(
    Array.sortWith(
      callsForMeeting(calls, meetingId),
      call => call.openedAt,
      Order.Number,
    ),
  )

export const meetingStartedOnPhone = (
  calls: ReadonlyArray<Call>,
  meetingId: string,
): boolean =>
  Option.match(firstCall(calls, meetingId), {
    onNone: () => false,
    onSome: call => call.kind._tag === 'KindPhone',
  })

export const openCall = (call: Call): boolean =>
  Option.isNone(call.maybeFinishedAt)

export const openVideoCallFor = (
  calls: ReadonlyArray<Call>,
  meetingId: string,
): Option.Option<Call> =>
  Array.findFirst(
    calls,
    call =>
      call.meetingId === meetingId &&
      call.kind._tag === 'KindVideo' &&
      openCall(call),
  )

export const openPhoneCallFor = (
  calls: ReadonlyArray<Call>,
  meetingId: string,
): Option.Option<Call> =>
  Array.findFirst(
    calls,
    call =>
      call.meetingId === meetingId &&
      call.kind._tag === 'KindPhone' &&
      openCall(call),
  )

export const meetingStart = (
  meeting: Meeting,
  calls: ReadonlyArray<Call>,
): number =>
  M.value(meeting.origin).pipe(
    M.tagsExhaustive({
      OriginScheduled: origin => origin.times.wall.start,
      OriginImpromptu: () =>
        Option.match(firstCall(calls, meeting.id), {
          onNone: () => meeting.createdAt,
          onSome: call => call.openedAt,
        }),
    }),
  )

export const patientName = (
  meeting: Meeting,
  people: ReadonlyArray<Person>,
): string =>
  Option.match(meeting.maybePatientId, {
    onNone: () => 'No patient',
    onSome: personId => personName(people, personId),
  })

export const callDurationMs = (call: Call): number =>
  Option.match(call.maybeFinishedAt, {
    onNone: () => 0,
    onSome: finishedAt => finishedAt - call.openedAt,
  })

const dayKey = (epochMs: number): string =>
  new Date(epochMs).toISOString().slice(0, 10)

export const dayMeetings = (
  meetings: ReadonlyArray<Meeting>,
  calls: ReadonlyArray<Call>,
  now: number,
): ReadonlyArray<Meeting> =>
  Array.filter(
    meetings,
    meeting =>
      Option.isNone(meeting.maybeCanceledAt) &&
      dayKey(meetingStart(meeting, calls)) === dayKey(now),
  )

export const historyCalls = (calls: ReadonlyArray<Call>): ReadonlyArray<Call> =>
  Array.sortWith(
    Array.filter(calls, call => Option.isSome(call.maybeFinishedAt)),
    call => call.openedAt,
    Order.flip(Order.Number),
  )

export const screenMeetingId = (screen: Screen): Option.Option<string> =>
  M.value(screen).pipe(
    M.tagsExhaustive({
      ScreenDay: () => Option.none(),
      ScreenHistory: () => Option.none(),
      ScreenPreview: ({ meetingId }) => Option.some(meetingId),
      ScreenWaiting: ({ meetingId }) => Option.some(meetingId),
      ScreenRoom: ({ meetingId }) => Option.some(meetingId),
      ScreenNotes: ({ meetingId }) => Option.some(meetingId),
    }),
  )

export const phoneCallId = (phone: PhonePhase): Option.Option<string> =>
  M.value(phone).pipe(
    M.tagsExhaustive({
      PhoneIdle: () => Option.none(),
      PhoneDialing: ({ callId }) => Option.some(callId),
      PhoneRinging: ({ callId }) => Option.some(callId),
      PhoneConnected: ({ callId }) => Option.some(callId),
    }),
  )

export const roleLabel = (role: Role): string =>
  M.value(role).pipe(
    M.tagsExhaustive({
      RoleAdvocate: () => 'Advocate',
      RolePhysician: () => 'Physician',
      RolePatient: () => 'Patient',
    }),
  )

export const preferredLabel = (preferred: Preferred): string =>
  M.value(preferred).pipe(
    M.tagsExhaustive({
      PreferredPhone: () => 'Phone',
      PreferredVideo: () => 'Video',
    }),
  )

export const kindLabel = (kind: Kind): string =>
  M.value(kind).pipe(
    M.tagsExhaustive({
      KindPhone: () => 'Phone',
      KindVideo: () => 'Video',
    }),
  )

export const prependTrace = (
  trace: ReadonlyArray<Trace>,
  at: number,
  label: string,
): ReadonlyArray<Trace> =>
  Array.prepend(Array.take(trace, 11), Trace.make({ at, label }))

export const applyGraph = (model: Model, graph: Graph): Model =>
  evo(model, {
    people: () => graph.people,
    meetings: () => graph.meetings,
    calls: () => graph.calls,
    participants: () => graph.participants,
    chats: () => graph.chats,
    segments: () => graph.segments,
  })

export const sessionParticipant = (
  model: Model,
  meetingId: string,
): Option.Option<Participant> =>
  Array.findFirst(
    participantsForMeeting(model.participants, meetingId),
    participant => participant.personId === model.sessionPersonId,
  )

export const isHostRole = (role: Role): boolean =>
  M.value(role).pipe(
    M.tagsExhaustive({
      RoleAdvocate: () => true,
      RolePhysician: () => true,
      RolePatient: () => false,
    }),
  )

export const canAdmit = (model: Model, meetingId: string): boolean =>
  Option.exists(
    sessionParticipant(model, meetingId),
    participant => isInRoom(participant) && isHostRole(participant.role),
  )

export const isHostSession = (model: Model, meetingId: string): boolean =>
  Option.exists(sessionParticipant(model, meetingId), participant =>
    isHostRole(participant.role),
  )

export const segmentsForCall = (
  segments: ReadonlyArray<Segment>,
  callId: string,
): ReadonlyArray<Segment> =>
  Array.sortWith(
    Array.filter(segments, segment => segment.callId === callId),
    segment => segment.index,
    Order.Number,
  )

export const segmentsForMeeting = (
  segments: ReadonlyArray<Segment>,
  calls: ReadonlyArray<Call>,
  meetingId: string,
): ReadonlyArray<Segment> =>
  Array.flatMap(callsForMeeting(calls, meetingId), call =>
    segmentsForCall(segments, call.id),
  )
