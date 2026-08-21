import {
  type Call,
  ClickedAdmit,
  ClickedAnswerPhone,
  ClickedArrive,
  ClickedDeclinePhone,
  ClickedFinishMeeting,
  ClickedGoBack,
  ClickedHangUpPhone,
  ClickedInvitePhysician,
  ClickedJoinVideo,
  ClickedLeaveVideo,
  ClickedOpenDay,
  ClickedOpenHistory,
  ClickedOpenMeeting,
  ClickedOpenNotes,
  ClickedPlacePhone,
  ClickedSendChat,
  ClickedSimulateGuestWaiting,
  ClickedSimulateInbound,
  ClickedStartImpromptu,
  ClickedStartShare,
  ClickedStopShare,
  ClickedSwitchPerson,
  ClickedToggleCaptions,
  type Meeting,
  type Message,
  type Model,
  type Participant,
  UpdatedDraft,
  UpdatedNotes,
  callDurationMs,
  canAdmit,
  chatsForMeeting,
  dayMeetings,
  historyCalls,
  inRoomForMeeting,
  isHostSession,
  kindLabel,
  meetingById,
  meetingStart,
  patientName,
  personName,
  preferredLabel,
  roleLabel,
  seedNow,
  segmentsForMeeting,
  sessionParticipant,
  waitingForMeeting,
} from 'advocacy-core-example'
import { Array, Match as M, Option } from 'effect'
import { Document, html } from 'foldkit/html'

import { Button, Input, Textarea } from '@foldkit/ui'

const h = html<Message>()

const primaryStyle =
  'bg-forest text-white hover:bg-forest-deep px-3 py-2 rounded-lg font-sans'
const quietStyle =
  'bg-waiting text-forest-ink hover:bg-opal px-3 py-2 rounded-lg border border-opal font-sans'
const dangerStyle =
  'bg-error text-white hover:bg-error/90 px-3 py-2 rounded-lg font-sans'
const selectedStyle = 'bg-forest-deep text-white px-3 py-2 rounded-lg font-sans'

const action = (
  label: string,
  message: Message,
  style = quietStyle,
  isDisabled = false,
) =>
  Button.view<Message>({
    onClick: message,
    isDisabled,
    toView: attributes =>
      h.button([...attributes.button, h.Class(style)], [label]),
  })

const wallTime = (epochMs: number): string =>
  new Date(epochMs).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  })

const durationLabel = (ms: number): string => {
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  return `${minutes}m ${seconds}s`
}

const originLabel = (meeting: Meeting): string =>
  M.value(meeting.origin).pipe(
    M.tagsExhaustive({
      OriginScheduled: origin =>
        `${preferredLabel(origin.preferred)} · ${wallTime(origin.times.wall.start)}`,
      OriginImpromptu: () => 'Impromptu',
    }),
  )

const waitingCopy = (count: number): string => {
  if (count === 0) {
    return 'No one waiting'
  }
  if (count === 1) {
    return '1 person in the waiting room'
  }
  return `${count} people in the waiting room`
}

const sourceLabel = (model: Model): string =>
  model.source === 'Instant' ? 'Live Instant graph' : 'Seed graph'

const meetingCard = (model: Model, meeting: Meeting) => {
  const waitingCount = Array.length(
    waitingForMeeting(model.participants, meeting.id),
  )
  const name = patientName(meeting, model.people)
  return h.keyed('article')(
    meeting.id,
    [
      h.Class(
        'bg-surface border border-opal rounded-xl p-4 space-y-3 shadow-sm',
      ),
    ],
    [
      h.button(
        [
          h.Class('w-full text-left space-y-1'),
          h.OnClick(ClickedOpenMeeting({ meetingId: meeting.id })),
        ],
        [
          h.div([h.Class('font-display text-xl text-forest-ink')], [name]),
          h.div(
            [h.Class('text-body text-sm')],
            [
              `${originLabel(meeting)} · ${wallTime(meetingStart(meeting, model.calls))}`,
            ],
          ),
          h.div(
            [
              h.Class(
                waitingCount === 0
                  ? 'text-muted text-sm'
                  : 'text-forest text-sm font-bold',
              ),
            ],
            [waitingCopy(waitingCount)],
          ),
        ],
      ),
    ],
  )
}

const dayView = (model: Model) => {
  const meetings = dayMeetings(model.meetings, model.calls, seedNow)
  return h.div(
    [h.Class('space-y-4')],
    [
      h.div([h.Class('font-display text-3xl text-forest-ink')], ['Today']),
      h.div(
        [h.Class('text-body')],
        ['Meetings for the day. History is calls.'],
      ),
      Array.match(meetings, {
        onEmpty: () => h.div([h.Class('text-muted')], ['No meetings today.']),
        onNonEmpty: rows =>
          h.div(
            [h.Class('space-y-3')],
            Array.map(rows, meeting => meetingCard(model, meeting)),
          ),
      }),
      h.div(
        [h.Class('flex flex-wrap gap-2')],
        [
          action(
            'Start impromptu meeting',
            ClickedStartImpromptu(),
            primaryStyle,
          ),
          action(
            'Simulate inbound from Elena',
            ClickedSimulateInbound(),
            quietStyle,
            model.phone._tag !== 'PhoneIdle',
          ),
        ],
      ),
    ],
  )
}

const callCard = (model: Model, call: Call) =>
  Option.match(meetingById(model.meetings, call.meetingId), {
    onNone: () =>
      h.keyed('article')(
        call.id,
        [h.Class('bg-surface border border-opal rounded-xl p-4')],
        [`Unknown meeting · ${kindLabel(call.kind)}`],
      ),
    onSome: meeting =>
      h.keyed('article')(
        call.id,
        [h.Class('bg-surface border border-opal rounded-xl p-4 space-y-2')],
        [
          h.button(
            [
              h.Class('w-full text-left space-y-1'),
              h.OnClick(ClickedOpenNotes({ meetingId: meeting.id })),
            ],
            [
              h.div(
                [h.Class('font-display text-xl text-forest-ink')],
                [patientName(meeting, model.people)],
              ),
              h.div(
                [h.Class('text-body text-sm')],
                [
                  `${kindLabel(call.kind)} · ${durationLabel(callDurationMs(call))} · ${wallTime(call.openedAt)}`,
                ],
              ),
            ],
          ),
        ],
      ),
  })

const historyView = (model: Model) => {
  const calls = historyCalls(model.calls)
  return h.div(
    [h.Class('space-y-4')],
    [
      h.div(
        [h.Class('font-display text-3xl text-forest-ink')],
        ['Call history'],
      ),
      Array.match(calls, {
        onEmpty: () => h.div([h.Class('text-muted')], ['No finished calls.']),
        onNonEmpty: rows =>
          h.div(
            [h.Class('space-y-3')],
            Array.map(rows, call => callCard(model, call)),
          ),
      }),
    ],
  )
}

const previewView = (model: Model, meetingId: string) =>
  Option.match(meetingById(model.meetings, meetingId), {
    onNone: () => h.div([], ['Unknown meeting']),
    onSome: meeting =>
      h.div(
        [h.Class('space-y-4')],
        [
          action('Back', ClickedGoBack()),
          h.div(
            [h.Class('font-display text-3xl text-forest-ink')],
            [`Preview · ${patientName(meeting, model.people)}`],
          ),
          h.div(
            [
              h.Class(
                'h-56 rounded-xl bg-forest-ink text-cream flex items-center justify-center',
              ),
            ],
            ['Camera preview'],
          ),
          h.div(
            [h.Class('text-body')],
            ['Microphone, camera, and background are host chrome.'],
          ),
          action('Join meeting', ClickedJoinVideo({ meetingId }), primaryStyle),
        ],
      ),
  })

const waitingView = (model: Model, meetingId: string) =>
  Option.match(meetingById(model.meetings, meetingId), {
    onNone: () => h.div([], ['Unknown meeting']),
    onSome: meeting => {
      const waiting = waitingForMeeting(model.participants, meetingId)
      const maybeMine = sessionParticipant(model, meetingId)
      const hasArrived = Option.exists(maybeMine, participant =>
        Option.isSome(participant.maybeArrivedAt),
      )
      return h.div(
        [h.Class('space-y-4')],
        [
          action('Back', ClickedGoBack()),
          h.div(
            [h.Class('font-display text-3xl text-forest-ink')],
            [`Waiting room · ${patientName(meeting, model.people)}`],
          ),
          h.div(
            [h.Class('bg-waiting rounded-xl p-6 space-y-3')],
            [
              h.div(
                [h.Class('text-body')],
                [
                  'The advocate will admit you. Leave this window open. Instant carries the admit into this session.',
                ],
              ),
              hasArrived
                ? h.div(
                    [h.Class('font-bold text-forest')],
                    ['You are in the waiting room.'],
                  )
                : action(
                    "I'm here",
                    ClickedArrive({ meetingId }),
                    primaryStyle,
                  ),
            ],
          ),
          Array.match(waiting, {
            onEmpty: () =>
              h.div([h.Class('text-muted')], ['No one else is waiting.']),
            onNonEmpty: rows =>
              h.div(
                [h.Class('space-y-2')],
                Array.map(rows, row =>
                  h.keyed('article')(
                    row.id,
                    [h.Class('text-sm text-forest-ink')],
                    [
                      `${personName(model.people, row.personId)} · ${roleLabel(row.role)}`,
                    ],
                  ),
                ),
              ),
          }),
        ],
      )
    },
  })

const participantRow = (
  model: Model,
  participant: Participant,
  meetingId: string,
) =>
  h.keyed('article')(
    participant.id,
    [
      h.Class(
        'flex items-center justify-between gap-3 bg-surface border border-opal rounded-lg p-3',
      ),
    ],
    [
      h.div(
        [],
        [
          h.div(
            [h.Class('font-bold text-forest-ink')],
            [personName(model.people, participant.personId)],
          ),
          h.div([h.Class('text-sm text-muted')], [roleLabel(participant.role)]),
        ],
      ),
      canAdmit(model, meetingId)
        ? action(
            `Admit ${personName(model.people, participant.personId)}`,
            ClickedAdmit({ participantId: participant.id }),
            primaryStyle,
          )
        : h.div([], []),
    ],
  )

const captionsPanel = (model: Model, meetingId: string) => {
  const segments = segmentsForMeeting(model.segments, model.calls, meetingId)
  if (!model.isCaptionsOn) {
    return action('Show captions', ClickedToggleCaptions())
  }
  return h.div(
    [h.Class('space-y-2')],
    [
      action('Hide captions', ClickedToggleCaptions()),
      Array.match(segments, {
        onEmpty: () =>
          h.div(
            [h.Class('text-muted text-sm')],
            ['No captions for this meeting yet.'],
          ),
        onNonEmpty: rows =>
          h.div(
            [h.Class('space-y-1 text-sm text-body')],
            Array.map(rows, segment =>
              h.keyed('article')(segment.id, [], [segment.text]),
            ),
          ),
      }),
    ],
  )
}

const roomView = (model: Model, meetingId: string) =>
  Option.match(meetingById(model.meetings, meetingId), {
    onNone: () => h.div([], ['Unknown meeting']),
    onSome: meeting => {
      const waiting = waitingForMeeting(model.participants, meetingId)
      const inRoom = inRoomForMeeting(model.participants, meetingId)
      const chats = chatsForMeeting(model.chats, meetingId)
      const isSharing =
        model.video._tag === 'VideoConnected' &&
        model.video.share._tag === 'ShareActive'
      const hostCanFinish = isHostSession(model, meetingId)
      return h.div(
        [h.Class('grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]')],
        [
          h.div(
            [h.Class('space-y-4')],
            [
              h.div(
                [h.Class('flex flex-wrap items-center gap-2')],
                [
                  h.div(
                    [h.Class('font-display text-3xl text-forest-ink')],
                    [patientName(meeting, model.people)],
                  ),
                  action('Leave', ClickedLeaveVideo(), dangerStyle),
                  isSharing
                    ? action('Stop sharing', ClickedStopShare())
                    : action('Share screen', ClickedStartShare()),
                  action(
                    'Place phone',
                    ClickedPlacePhone({ meetingId }),
                    quietStyle,
                    model.phone._tag !== 'PhoneIdle',
                  ),
                  hostCanFinish
                    ? action(
                        'Finish meeting',
                        ClickedFinishMeeting(),
                        quietStyle,
                      )
                    : h.div([], []),
                ],
              ),
              h.div(
                [
                  h.Class(
                    'h-64 rounded-xl bg-forest-ink text-cream flex items-center justify-center',
                  ),
                ],
                [
                  isSharing
                    ? 'Screen share is live'
                    : 'Video room · phone is an independent axis',
                ],
              ),
              captionsPanel(model, meetingId),
              h.div(
                [h.Class('space-y-2')],
                [
                  h.div([h.Class('font-bold')], ['Chat']),
                  Array.match(chats, {
                    onEmpty: () =>
                      h.div([h.Class('text-muted text-sm')], ['No messages.']),
                    onNonEmpty: rows =>
                      h.div(
                        [h.Class('space-y-2')],
                        Array.map(rows, chat =>
                          h.keyed('article')(
                            chat.id,
                            [h.Class('text-sm')],
                            [
                              `${personName(model.people, chat.authorId)}: ${chat.text}`,
                            ],
                          ),
                        ),
                      ),
                  }),
                  Input.view<Message>({
                    id: 'chat-draft',
                    value: model.draft,
                    onInput: value => UpdatedDraft({ value }),
                    placeholder: 'Message the room',
                    toView: attributes =>
                      h.div(
                        [h.Class('flex gap-2')],
                        [
                          h.input([
                            ...attributes.input,
                            h.Class(
                              'flex-1 border border-opal rounded-lg px-3 py-2 bg-surface',
                            ),
                          ]),
                          action('Send', ClickedSendChat(), primaryStyle),
                        ],
                      ),
                  }),
                ],
              ),
            ],
          ),
          h.div(
            [h.Class('space-y-4')],
            [
              h.div(
                [h.Class('bg-waiting rounded-xl p-4 space-y-3')],
                [
                  h.div(
                    [h.Class('font-display text-2xl text-forest-ink')],
                    ['Waiting room'],
                  ),
                  Array.match(waiting, {
                    onEmpty: () =>
                      h.div(
                        [h.Class('text-muted text-sm')],
                        ['No one is waiting.'],
                      ),
                    onNonEmpty: rows =>
                      h.div(
                        [h.Class('space-y-2')],
                        Array.map(rows, row =>
                          participantRow(model, row, meetingId),
                        ),
                      ),
                  }),
                  action(
                    'Simulate physician arriving',
                    ClickedInvitePhysician({ meetingId }),
                  ),
                  action(
                    'Add guest to waiting room',
                    ClickedSimulateGuestWaiting({ meetingId }),
                  ),
                ],
              ),
              h.div(
                [h.Class('bg-clinical rounded-xl p-4 space-y-3')],
                [
                  h.div(
                    [h.Class('font-display text-2xl text-forest-ink')],
                    ['In the room'],
                  ),
                  Array.match(inRoom, {
                    onEmpty: () =>
                      h.div([h.Class('text-muted text-sm')], ['Empty room.']),
                    onNonEmpty: rows =>
                      h.div(
                        [h.Class('space-y-2')],
                        Array.map(rows, row =>
                          h.keyed('article')(
                            row.id,
                            [h.Class('text-sm text-forest-ink')],
                            [
                              `${personName(model.people, row.personId)} · ${roleLabel(row.role)}`,
                            ],
                          ),
                        ),
                      ),
                  }),
                ],
              ),
            ],
          ),
        ],
      )
    },
  })

const notesView = (model: Model, meetingId: string) =>
  Option.match(meetingById(model.meetings, meetingId), {
    onNone: () => h.div([], ['Unknown meeting']),
    onSome: meeting => {
      const segments = segmentsForMeeting(
        model.segments,
        model.calls,
        meetingId,
      )
      return h.div(
        [h.Class('space-y-4')],
        [
          action('Back', ClickedGoBack()),
          h.div(
            [h.Class('font-display text-3xl text-forest-ink')],
            [`Notes · ${patientName(meeting, model.people)}`],
          ),
          Textarea.view<Message>({
            id: 'meeting-notes',
            value: meeting.notes,
            onInput: value => UpdatedNotes({ value }),
            rows: 8,
            placeholder: 'Visit notes sync across Instant clients',
            toView: attributes =>
              h.textarea(
                [
                  ...attributes.textarea,
                  h.Class(
                    'w-full border border-opal rounded-xl px-3 py-2 bg-surface min-h-40',
                  ),
                ],
                [],
              ),
          }),
          h.div([h.Class('font-bold text-forest-ink')], ['Transcript']),
          Array.match(segments, {
            onEmpty: () =>
              h.div([h.Class('text-muted')], ['No transcript yet.']),
            onNonEmpty: rows =>
              h.div(
                [h.Class('space-y-2 text-sm text-body')],
                Array.map(rows, segment =>
                  h.keyed('article')(segment.id, [], [segment.text]),
                ),
              ),
          }),
        ],
      )
    },
  })

const phoneBanner = (model: Model) =>
  M.value(model.phone).pipe(
    M.withReturnType<ReturnType<typeof h.div>>(),
    M.tagsExhaustive({
      PhoneIdle: () => h.div([], []),
      PhoneDialing: () =>
        h.div(
          [
            h.Class(
              'flex flex-wrap items-center justify-between gap-3 bg-clinical border border-opal rounded-xl p-3',
            ),
          ],
          [
            h.div([], ['Dialing…']),
            action('Hang up', ClickedHangUpPhone(), dangerStyle),
          ],
        ),
      PhoneRinging: () =>
        h.div(
          [
            h.Class(
              'flex flex-wrap items-center justify-between gap-3 bg-waiting border border-forest rounded-xl p-3',
            ),
          ],
          [
            h.div(
              [h.Class('font-bold text-forest-ink')],
              ['Incoming call · waiting to connect'],
            ),
            h.div(
              [h.Class('flex gap-2')],
              [
                action('Answer', ClickedAnswerPhone(), primaryStyle),
                action('Decline', ClickedDeclinePhone(), dangerStyle),
              ],
            ),
          ],
        ),
      PhoneConnected: () =>
        h.div(
          [
            h.Class(
              'flex flex-wrap items-center justify-between gap-3 bg-forest text-white rounded-xl p-3',
            ),
          ],
          [
            h.div([], ['Phone connected']),
            action('Hang up', ClickedHangUpPhone(), dangerStyle),
          ],
        ),
    }),
  )

const traceView = (model: Model) =>
  Array.match(model.trace, {
    onEmpty: () =>
      h.div([h.Class('text-muted text-sm')], ['No mock events yet.']),
    onNonEmpty: rows =>
      h.div(
        [h.Class('space-y-1 text-sm text-body')],
        Array.map(rows, row =>
          h.keyed('article')(row.label + String(row.at), [], [row.label]),
        ),
      ),
  })

const personSwitcher = (model: Model) =>
  h.div(
    [h.Class('flex flex-wrap gap-2')],
    Array.map(model.people, person =>
      action(
        `As ${person.name}`,
        ClickedSwitchPerson({ personId: person.id }),
        person.id === model.sessionPersonId ? selectedStyle : quietStyle,
      ),
    ),
  )

const screenView = (model: Model) =>
  M.value(model.screen).pipe(
    M.withReturnType<ReturnType<typeof h.div>>(),
    M.tagsExhaustive({
      ScreenDay: () => dayView(model),
      ScreenHistory: () => historyView(model),
      ScreenPreview: ({ meetingId }) => previewView(model, meetingId),
      ScreenWaiting: ({ meetingId }) => waitingView(model, meetingId),
      ScreenRoom: ({ meetingId }) => roomView(model, meetingId),
      ScreenNotes: ({ meetingId }) => notesView(model, meetingId),
    }),
  )

export const view = (model: Model): Document => ({
  title: 'Advocacy',
  body: h.div(
    [h.Class('min-h-screen bg-cream text-ink font-sans')],
    [
      h.div(
        [
          h.Class(
            'bg-forest text-white px-6 py-4 flex flex-wrap items-end justify-between gap-4',
          ),
        ],
        [
          h.div(
            [],
            [
              h.div([h.Class('font-display text-2xl')], ['Advocacy']),
              h.div(
                [h.Class('text-opal text-sm')],
                [personName(model.people, model.sessionPersonId)],
              ),
              h.div([h.Class('text-opal text-sm')], [sourceLabel(model)]),
            ],
          ),
          h.div(
            [h.Class('flex flex-wrap gap-2')],
            [
              action('Today', ClickedOpenDay(), quietStyle),
              action('History', ClickedOpenHistory(), quietStyle),
            ],
          ),
        ],
      ),
      h.div(
        [h.Class('max-w-6xl mx-auto p-6 space-y-4')],
        [
          h.div(
            [h.Class('bg-waiting border border-opal rounded-xl p-4 space-y-3')],
            [
              h.div(
                [h.Class('font-bold text-forest-ink')],
                ['Two-window sync'],
              ),
              h.div(
                [h.Class('text-sm text-body')],
                [
                  'Open this page in a second window. Switch that window to Sam Ortiz, open the video meeting, then admit Sam here. Instant keeps waiting, admit, chat, and notes in sync with the TUI and CLI.',
                ],
              ),
              personSwitcher(model),
            ],
          ),
          phoneBanner(model),
          screenView(model),
          h.div(
            [h.Class('bg-surface border border-opal rounded-xl p-4 space-y-2')],
            [
              h.div([h.Class('font-bold text-forest-ink')], ['Mock events']),
              traceView(model),
            ],
          ),
        ],
      ),
    ],
  ),
})
