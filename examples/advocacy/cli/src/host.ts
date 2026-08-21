import {
  AdvocacyProgram,
  ClickedAdmit,
  type Message,
  type Model,
  dayMeetings,
  personName,
  seedNow,
  waitingForMeeting,
} from 'advocacy-core-example'
import { Array, Console, Duration, Effect, Option, Schema as S } from 'effect'
import { Runtime } from 'foldkit'

import { advocacyResources } from './resources.js'

/** Operations supported by the one-shot Advocacy client. */
export const CliOperation = S.Literals(['List', 'Waiting', 'Admit'])
/** A one-shot Advocacy operation. */
export type CliOperation = typeof CliOperation.Type

const waitForGraph = (
  runtime: Runtime.ProgramRuntime<Model, Message>,
): Effect.Effect<Model> => {
  const attempt = (remaining: number): Effect.Effect<Model> =>
    Effect.gen(function* () {
      const model = runtime.readModel()
      if (model.source === 'Instant' || remaining === 0) {
        return model
      }
      yield* Effect.sleep(Duration.millis(100))
      return yield* attempt(remaining - 1)
    })
  return attempt(20)
}

/** Runs one CLI operation through the renderer-free runtime. */
export const executeCliOperation = (
  operation: CliOperation,
  maybeParticipantId: Option.Option<string>,
): Effect.Effect<Model> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: AdvocacyProgram,
          resources: advocacyResources(),
        }),
      )
      yield* runtime.initialization
      let model = yield* waitForGraph(runtime)
      if (operation === 'Admit' && Option.isSome(maybeParticipantId)) {
        model = yield* runtime.run(
          ClickedAdmit({ participantId: maybeParticipantId.value }),
        )
        yield* Effect.sleep(Duration.millis(250))
        model = runtime.readModel()
      }
      yield* runtime.shutdown
      return model
    }),
  )

const sourceLine = (model: Model): string =>
  model.source === 'Instant'
    ? 'source=Instant'
    : 'source=StaticFallback Instant unreachable or empty'

/** Runs one CLI operation and prints the graph. */
export const runCliOperation = (
  operation: CliOperation,
  maybeParticipantId: Option.Option<string>,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const model = yield* executeCliOperation(operation, maybeParticipantId)
    yield* Console.log(sourceLine(model))
    if (operation === 'Admit') {
      yield* Console.log(
        Option.match(maybeParticipantId, {
          onNone: () => 'participant id required',
          onSome: participantId => `admitted ${participantId}`,
        }),
      )
      return
    }
    const meetings = dayMeetings(model.meetings, model.calls, seedNow)
    if (operation === 'List') {
      for (const meeting of meetings) {
        const waitingCount = Array.length(
          waitingForMeeting(model.participants, meeting.id),
        )
        yield* Console.log(
          `${meeting.id}\t${personName(
            model.people,
            Option.getOrElse(meeting.maybePatientId, () => meeting.id),
          )}\twait=${String(waitingCount)}`,
        )
      }
      return
    }
    for (const meeting of meetings) {
      for (const participant of waitingForMeeting(
        model.participants,
        meeting.id,
      )) {
        yield* Console.log(
          `${participant.id}\t${personName(model.people, participant.personId)}\t${meeting.id}`,
        )
      }
    }
  })
