import {
  AdvocacyProgram,
  ClickedAdmit,
  ClickedOpenDay,
  ClickedOpenHistory,
  ClickedOpenMeeting,
  ClickedSwitchPerson,
  type Message,
  type Model,
  dayMeetings,
  historyCalls,
  personName,
  seedNow,
  waitingForMeeting,
} from 'advocacy-core-example'
import {
  Array,
  Cause,
  Effect,
  Option,
  PlatformError,
  Queue,
  Terminal,
} from 'effect'
import { Runtime } from 'foldkit'

import { advocacyResources } from './resources.js'

const CLEAR_SCREEN = '\u001b[2J\u001b[H'
const SCREEN_INNER_WIDTH = 72

const framed = (content: string): string => {
  const clipped = content.slice(0, SCREEN_INNER_WIDTH)
  const remainingWidth = Math.max(0, SCREEN_INNER_WIDTH - clipped.length)
  return `| ${clipped}${' '.repeat(Math.max(0, remainingWidth - 1))}|`
}

const sourceLabel = (model: Model): string =>
  model.source === 'Instant' ? 'Instant' : 'StaticFallback'

/** Renders the imported Advocacy Model as a terminal screen. */
export const renderAdvocacyScreen = (model: Model): string => {
  const border = `+${'-'.repeat(SCREEN_INNER_WIDTH)}+`
  const meetings = dayMeetings(model.meetings, model.calls, seedNow)
  const sessionName = personName(model.people, model.sessionPersonId)
  const meetingLines = Array.map(meetings, (meeting, index) => {
    const waitingCount = Array.length(
      waitingForMeeting(model.participants, meeting.id),
    )
    return framed(
      `${index + 1}. ${personName(
        model.people,
        Option.getOrElse(meeting.maybePatientId, () => meeting.id),
      )}  wait=${String(waitingCount)}`,
    )
  })
  const peopleLines = Array.map(model.people, person =>
    framed(`${person.id === model.sessionPersonId ? '*' : ' '} ${person.name}`),
  )
  const historyCount = Array.length(historyCalls(model.calls))
  const lines = [
    border,
    framed('Advocacy meetings'),
    framed(`${sourceLabel(model)} · ${sessionName}`),
    framed(
      `Screen ${model.screen._tag} · history calls ${String(historyCount)}`,
    ),
    framed(''),
    framed('People  [P] next person   Meetings  [number] open'),
    ...peopleLines,
    framed(''),
    ...meetingLines,
    framed(''),
    framed('[A] admit first waiter   [T] today   [H] history   [Q] quit'),
    border,
  ]
  return `${CLEAR_SCREEN}${lines.join('\n')}\n`
}

const firstWaitingId = (model: Model): Option.Option<string> => {
  const meetings = dayMeetings(model.meetings, model.calls, seedNow)
  return Option.flatMap(Array.head(meetings), meeting =>
    Option.map(
      Array.head(waitingForMeeting(model.participants, meeting.id)),
      participant => participant.id,
    ),
  )
}

/** Maps a terminal key to an imported Advocacy Message when applicable. */
export const messageForInput = (
  input: string,
  model: Model,
): Option.Option<Message> => {
  const key = input.toLowerCase()
  if (key === 't') {
    return Option.some(ClickedOpenDay())
  }
  if (key === 'h') {
    return Option.some(ClickedOpenHistory())
  }
  if (key === 'a') {
    return Option.map(firstWaitingId(model), participantId =>
      ClickedAdmit({ participantId }),
    )
  }
  if (key === 'p') {
    const currentIndex = Array.findFirstIndex(
      model.people,
      person => person.id === model.sessionPersonId,
    )
    const nextIndex = Option.match(currentIndex, {
      onNone: () => 0,
      onSome: index => (index + 1) % Array.length(model.people),
    })
    return Option.map(Array.get(model.people, nextIndex), person =>
      ClickedSwitchPerson({ personId: person.id }),
    )
  }
  const asNumber = Number.parseInt(key, 10)
  if (!Number.isInteger(asNumber) || asNumber < 1) {
    return Option.none()
  }
  const meetings = dayMeetings(model.meetings, model.calls, seedNow)
  return Option.map(Array.get(meetings, asNumber - 1), meeting =>
    ClickedOpenMeeting({ meetingId: meeting.id }),
  )
}

const runInputLoop = (
  inputQueue: Queue.Dequeue<Terminal.UserInput, Cause.Done>,
  runtime: Runtime.ProgramRuntime<Model, Message>,
  terminal: Terminal.Terminal,
): Effect.Effect<void, Cause.Done | PlatformError.PlatformError> =>
  Queue.take(inputQueue).pipe(
    Effect.flatMap(input => {
      const key = Option.getOrElse(
        input.input,
        () => input.key.name,
      ).toLowerCase()
      if (key === 'q') {
        return Effect.void
      }
      const maybeMessage = messageForInput(key, runtime.readModel())
      if (Option.isSome(maybeMessage)) {
        return runtime.run(maybeMessage.value).pipe(
          Effect.flatMap(model =>
            terminal.display(renderAdvocacyScreen(model)),
          ),
          Effect.flatMap(() => runInputLoop(inputQueue, runtime, terminal)),
        )
      }
      return runInputLoop(inputQueue, runtime, terminal)
    }),
  )

/** Runs the interactive terminal host over the imported Advocacy program. */
export const runAdvocacyTui = (): Effect.Effect<
  void,
  Cause.Done | PlatformError.PlatformError,
  Terminal.Terminal
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: AdvocacyProgram,
          resources: advocacyResources(),
        }),
      )
      yield* runtime.initialization
      yield* terminal.display(renderAdvocacyScreen(runtime.readModel()))
      const inputQueue = yield* terminal.readInput
      yield* runInputLoop(inputQueue, runtime, terminal)
      yield* runtime.shutdown
    }),
  )
