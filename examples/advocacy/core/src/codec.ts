import { Array, Match as M, Option, Schema as S } from 'effect'
import { ts } from 'foldkit/schema'

import {
  InstantKindTags,
  InstantOriginTags,
  InstantPreferredTags,
  InstantRoleTags,
} from './instantTags.js'
import {
  Call,
  Chat,
  Graph,
  KindPhone,
  KindVideo,
  Meeting,
  OriginImpromptu,
  OriginScheduled,
  Participant,
  Person,
  PhoneNumber,
  PreferredPhone,
  PreferredVideo,
  RoleAdvocate,
  RolePatient,
  RolePhysician,
  Segment,
  Times,
} from './model.js'

const InstantPreferredTag = S.Literals(InstantPreferredTags)
const InstantRoleTag = S.Literals(InstantRoleTags)
const [scheduledOriginTag, impromptuOriginTag] = InstantOriginTags
const [phonePreferredTag, videoPreferredTag] = InstantPreferredTags
const [phoneKindTag, videoKindTag] = InstantKindTags
const [roleAdvocateTag, rolePhysicianTag, rolePatientTag] = InstantRoleTags

export const WritePerson = ts('WritePerson', { person: Person })
export const WriteMeeting = ts('WriteMeeting', { meeting: Meeting })
export const WriteCall = ts('WriteCall', { call: Call })
export const WriteParticipant = ts('WriteParticipant', {
  participant: Participant,
})
export const WriteChat = ts('WriteChat', { chat: Chat })
export const WriteSegment = ts('WriteSegment', { segment: Segment })
export const Write = S.Union([
  WritePerson,
  WriteMeeting,
  WriteCall,
  WriteParticipant,
  WriteChat,
  WriteSegment,
])
export type Write = typeof Write.Type

const InstantPerson = S.Struct({
  id: S.String,
  name: S.String,
})

const InstantMeetingShared = {
  id: S.String,
  createdAt: S.Number,
  notes: S.String,
  canceledAt: S.optionalKey(S.Number),
  finishedAt: S.optionalKey(S.Number),
  patientId: S.optionalKey(S.String),
}

const InstantScheduledMeeting = S.Struct({
  ...InstantMeetingShared,
  originTag: S.Literals([scheduledOriginTag]),
  preferredTag: InstantPreferredTag,
  start: S.Number,
  end: S.Number,
})

const InstantImpromptuMeeting = S.Struct({
  ...InstantMeetingShared,
  originTag: S.Literals([impromptuOriginTag]),
})

const InstantMeeting = S.Union([
  InstantScheduledMeeting,
  InstantImpromptuMeeting,
])

const InstantCallShared = {
  id: S.String,
  meetingId: S.String,
  openedAt: S.Number,
  connectedAt: S.optionalKey(S.Number),
  finishedAt: S.optionalKey(S.Number),
}

const InstantPhoneCall = S.Struct({
  ...InstantCallShared,
  kindTag: S.Literals([phoneKindTag]),
  fromNumber: PhoneNumber,
})

const InstantVideoCall = S.Struct({
  ...InstantCallShared,
  kindTag: S.Literals([videoKindTag]),
})

const InstantCall = S.Union([InstantPhoneCall, InstantVideoCall])

const InstantParticipant = S.Struct({
  id: S.String,
  meetingId: S.String,
  personId: S.String,
  invitedAt: S.Number,
  roleTag: InstantRoleTag,
  admittedAt: S.optionalKey(S.Number),
  arrivedAt: S.optionalKey(S.Number),
  failedAt: S.optionalKey(S.Number),
  leftAt: S.optionalKey(S.Number),
})

const InstantChat = S.Struct({
  id: S.String,
  meetingId: S.String,
  authorId: S.String,
  createdAt: S.Number,
  text: S.String,
})

const InstantSegment = S.Struct({
  id: S.String,
  callId: S.String,
  index: S.Number,
  createdAt: S.Number,
  text: S.String,
})

const maybeNumber = (value: number | undefined): Option.Option<number> =>
  value === undefined ? Option.none() : Option.some(value)

const maybeString = (value: string | undefined): Option.Option<string> =>
  value === undefined ? Option.none() : Option.some(value)

const decodePeople = (rows: ReadonlyArray<unknown>): ReadonlyArray<Person> =>
  Array.flatMap(rows, row =>
    Option.match(S.decodeUnknownOption(InstantPerson)(row), {
      onNone: () => [],
      onSome: value => [toPerson(value)],
    }),
  )

const decodeMeetings = (rows: ReadonlyArray<unknown>): ReadonlyArray<Meeting> =>
  Array.flatMap(rows, row =>
    Option.match(S.decodeUnknownOption(InstantMeeting)(row), {
      onNone: () => [],
      onSome: value => [toMeeting(value)],
    }),
  )

const decodeCalls = (rows: ReadonlyArray<unknown>): ReadonlyArray<Call> =>
  Array.flatMap(rows, row =>
    Option.match(S.decodeUnknownOption(InstantCall)(row), {
      onNone: () => [],
      onSome: value => [toCall(value)],
    }),
  )

const decodeParticipants = (
  rows: ReadonlyArray<unknown>,
): ReadonlyArray<Participant> =>
  Array.flatMap(rows, row =>
    Option.match(S.decodeUnknownOption(InstantParticipant)(row), {
      onNone: () => [],
      onSome: value => [toParticipant(value)],
    }),
  )

const decodeChats = (rows: ReadonlyArray<unknown>): ReadonlyArray<Chat> =>
  Array.flatMap(rows, row =>
    Option.match(S.decodeUnknownOption(InstantChat)(row), {
      onNone: () => [],
      onSome: value => [toChat(value)],
    }),
  )

const decodeSegments = (rows: ReadonlyArray<unknown>): ReadonlyArray<Segment> =>
  Array.flatMap(rows, row =>
    Option.match(S.decodeUnknownOption(InstantSegment)(row), {
      onNone: () => [],
      onSome: value => [toSegment(value)],
    }),
  )

const toPerson = (row: typeof InstantPerson.Type): Person =>
  Person.make({ id: row.id, name: row.name })

const toPreferred = (tag: typeof InstantPreferredTag.Type) => {
  if (tag === phonePreferredTag) {
    return PreferredPhone()
  }
  return PreferredVideo()
}

const toOrigin = (row: typeof InstantMeeting.Type) => {
  if (row.originTag === impromptuOriginTag) {
    return OriginImpromptu()
  }
  return OriginScheduled({
    preferred: toPreferred(row.preferredTag),
    times: Times.make({
      wall: {
        start: row.start,
        end: row.end,
      },
      relative: {
        start: 0,
        end: row.end - row.start,
      },
    }),
  })
}

const toKind = (row: typeof InstantCall.Type) => {
  if (row.kindTag === phoneKindTag) {
    return KindPhone({ fromNumber: row.fromNumber })
  }
  return KindVideo()
}

const toMeeting = (row: typeof InstantMeeting.Type): Meeting =>
  Meeting.make({
    id: row.id,
    createdAt: row.createdAt,
    notes: row.notes,
    maybePatientId: maybeString(row.patientId),
    maybeCanceledAt: maybeNumber(row.canceledAt),
    maybeFinishedAt: maybeNumber(row.finishedAt),
    origin: toOrigin(row),
  })

const toCall = (row: typeof InstantCall.Type): Call =>
  Call.make({
    id: row.id,
    meetingId: row.meetingId,
    openedAt: row.openedAt,
    maybeConnectedAt: maybeNumber(row.connectedAt),
    maybeFinishedAt: maybeNumber(row.finishedAt),
    kind: toKind(row),
  })

const toRole = (roleTag: typeof InstantRoleTag.Type) => {
  if (roleTag === roleAdvocateTag) {
    return RoleAdvocate()
  }
  if (roleTag === rolePhysicianTag) {
    return RolePhysician()
  }
  return RolePatient()
}

const toParticipant = (row: typeof InstantParticipant.Type): Participant =>
  Participant.make({
    id: row.id,
    meetingId: row.meetingId,
    personId: row.personId,
    role: toRole(row.roleTag),
    invitedAt: row.invitedAt,
    maybeArrivedAt: maybeNumber(row.arrivedAt),
    maybeAdmittedAt: maybeNumber(row.admittedAt),
    maybeLeftAt: maybeNumber(row.leftAt),
    maybeFailedAt: maybeNumber(row.failedAt),
  })

const toChat = (row: typeof InstantChat.Type): Chat =>
  Chat.make({
    id: row.id,
    meetingId: row.meetingId,
    authorId: row.authorId,
    createdAt: row.createdAt,
    text: row.text,
  })

const toSegment = (row: typeof InstantSegment.Type): Segment =>
  Segment.make({
    id: row.id,
    callId: row.callId,
    index: row.index,
    createdAt: row.createdAt,
    text: row.text,
  })

/** Builds a domain graph from Instant query rows. */
export const graphFromInstantRows = (rows: {
  advocacyPeople: ReadonlyArray<unknown>
  advocacyMeetings: ReadonlyArray<unknown>
  advocacyCalls: ReadonlyArray<unknown>
  advocacyParticipants: ReadonlyArray<unknown>
  advocacyChats: ReadonlyArray<unknown>
  advocacySegments: ReadonlyArray<unknown>
}): Graph =>
  Graph.make({
    people: decodePeople(rows.advocacyPeople),
    meetings: decodeMeetings(rows.advocacyMeetings),
    calls: decodeCalls(rows.advocacyCalls),
    participants: decodeParticipants(rows.advocacyParticipants),
    chats: decodeChats(rows.advocacyChats),
    segments: decodeSegments(rows.advocacySegments),
  })

const at = (option: Option.Option<number>): number | undefined =>
  Option.getOrUndefined(option)

/** Encodes one domain write as Instant attribute fields. */
export const encodeWrite = (
  write: Write,
): Readonly<{
  namespace:
    | 'advocacyPeople'
    | 'advocacyMeetings'
    | 'advocacyCalls'
    | 'advocacyParticipants'
    | 'advocacyChats'
    | 'advocacySegments'
  id: string
  attrs: Record<string, string | number>
}> =>
  M.value(write).pipe(
    M.tagsExhaustive({
      WritePerson: ({ person }) => ({
        namespace: 'advocacyPeople' as const,
        id: person.id,
        attrs: { name: person.name },
      }),
      WriteMeeting: ({ meeting }) => {
        const originAttrs = M.value(meeting.origin).pipe(
          M.withReturnType<Record<string, string | number>>(),
          M.tagsExhaustive({
            OriginImpromptu: () => ({
              originTag: impromptuOriginTag,
            }),
            OriginScheduled: ({ preferred, times }) => ({
              originTag: scheduledOriginTag,
              start: times.wall.start,
              end: times.wall.end,
              preferredTag: M.value(preferred).pipe(
                M.tagsExhaustive({
                  PreferredPhone: () => phonePreferredTag,
                  PreferredVideo: () => videoPreferredTag,
                }),
              ),
            }),
          }),
        )
        const attrs: Record<string, string | number> = {
          createdAt: meeting.createdAt,
          notes: meeting.notes,
          ...originAttrs,
        }
        const canceledAt = at(meeting.maybeCanceledAt)
        if (canceledAt !== undefined) {
          attrs['canceledAt'] = canceledAt
        }
        const finishedAt = at(meeting.maybeFinishedAt)
        if (finishedAt !== undefined) {
          attrs['finishedAt'] = finishedAt
        }
        const patientId = Option.getOrUndefined(meeting.maybePatientId)
        if (patientId !== undefined) {
          attrs['patientId'] = patientId
        }
        return {
          namespace: 'advocacyMeetings' as const,
          id: meeting.id,
          attrs,
        }
      },
      WriteCall: ({ call }) => {
        const kindAttrs = M.value(call.kind).pipe(
          M.tagsExhaustive({
            KindPhone: ({ fromNumber }) => ({
              kindTag: phoneKindTag,
              fromNumber,
            }),
            KindVideo: () => ({
              kindTag: videoKindTag,
            }),
          }),
        )
        const attrs: Record<string, string | number> = {
          meetingId: call.meetingId,
          openedAt: call.openedAt,
          ...kindAttrs,
        }
        const connectedAt = at(call.maybeConnectedAt)
        if (connectedAt !== undefined) {
          attrs['connectedAt'] = connectedAt
        }
        const finishedAt = at(call.maybeFinishedAt)
        if (finishedAt !== undefined) {
          attrs['finishedAt'] = finishedAt
        }
        return {
          namespace: 'advocacyCalls' as const,
          id: call.id,
          attrs,
        }
      },
      WriteParticipant: ({ participant }) => {
        const attrs: Record<string, string | number> = {
          meetingId: participant.meetingId,
          personId: participant.personId,
          invitedAt: participant.invitedAt,
          roleTag: M.value(participant.role).pipe(
            M.tagsExhaustive({
              RoleAdvocate: () => roleAdvocateTag,
              RolePhysician: () => rolePhysicianTag,
              RolePatient: () => rolePatientTag,
            }),
          ),
        }
        const arrivedAt = at(participant.maybeArrivedAt)
        if (arrivedAt !== undefined) {
          attrs['arrivedAt'] = arrivedAt
        }
        const admittedAt = at(participant.maybeAdmittedAt)
        if (admittedAt !== undefined) {
          attrs['admittedAt'] = admittedAt
        }
        const leftAt = at(participant.maybeLeftAt)
        if (leftAt !== undefined) {
          attrs['leftAt'] = leftAt
        }
        const failedAt = at(participant.maybeFailedAt)
        if (failedAt !== undefined) {
          attrs['failedAt'] = failedAt
        }
        return {
          namespace: 'advocacyParticipants' as const,
          id: participant.id,
          attrs,
        }
      },
      WriteChat: ({ chat }) => ({
        namespace: 'advocacyChats' as const,
        id: chat.id,
        attrs: {
          meetingId: chat.meetingId,
          authorId: chat.authorId,
          createdAt: chat.createdAt,
          text: chat.text,
        },
      }),
      WriteSegment: ({ segment }) => ({
        namespace: 'advocacySegments' as const,
        id: segment.id,
        attrs: {
          callId: segment.callId,
          index: segment.index,
          createdAt: segment.createdAt,
          text: segment.text,
        },
      }),
    }),
  )

/** Encodes every seed row so ingest can upsert the demo graph. */
export const writesForGraph = (graph: Graph): ReadonlyArray<Write> => [
  ...Array.map(graph.people, person => WritePerson({ person })),
  ...Array.map(graph.meetings, meeting => WriteMeeting({ meeting })),
  ...Array.map(graph.calls, call => WriteCall({ call })),
  ...Array.map(graph.participants, participant =>
    WriteParticipant({ participant }),
  ),
  ...Array.map(graph.chats, chat => WriteChat({ chat })),
  ...Array.map(graph.segments, segment => WriteSegment({ segment })),
]
