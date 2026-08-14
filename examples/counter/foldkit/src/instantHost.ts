import {
  CounterProgram,
  Message,
  type Model,
  counterTapeProgramId,
  counterTapeProgramVersion,
} from 'counter-core-example'
import { Array, Effect, Layer, Option, Stream } from 'effect'
import { Processor, Runtime } from 'foldkit'

import {
  InstantProgramSchema,
  commitSharedMessage,
  ensureHostedInstantSession,
  makeInstantProgramStore,
  makeSharedProgramTape,
} from '@foldkit/instant'
import { init } from '@instantdb/core'

import { counterDemoSessionPath } from './demoSessionPath.js'
import { view } from './view.js'

const counterInstantSessionId = 'counter-session'
const foldkitProcessorId = 'foldkit'

const projectMessages = (
  messages: ReadonlyArray<Message>,
): Effect.Effect<Model> =>
  Effect.scoped(
    Effect.gen(function* () {
      const runtime = yield* Effect.orDie(
        Runtime.makeProgramRuntime({
          program: CounterProgram,
          resources: Layer.empty,
        }),
      )
      yield* runtime.initialization
      yield* Effect.forEach(messages, message => runtime.run(message), {
        discard: true,
      })
      return runtime.readModel()
    }),
  )

const signInDemoSession = async (
  database: ReturnType<typeof init<typeof InstantProgramSchema>>,
): Promise<void> => {
  const existing = await database.getAuth()
  if (existing !== null) {
    return
  }
  const response = await fetch(counterDemoSessionPath, {
    credentials: 'same-origin',
  })
  if (!response.ok) {
    return
  }
  const body: unknown = await response.json()
  if (
    typeof body !== 'object' ||
    body === null ||
    !('token' in body) ||
    typeof body.token !== 'string'
  ) {
    return
  }
  await database.auth.signInWithToken(body.token)
}

/** Starts the Foldkit Processor on the live Instant Counter tape. */
export const startInstantCounter = (appId: string): void => {
  void Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const database = init({ appId, schema: InstantProgramSchema })
        yield* Effect.promise(() => ensureHostedInstantSession(database))
        yield* Effect.promise(() => signInDemoSession(database))
        const user = yield* Effect.promise(() => database.getAuth())
        if (user === null) {
          return
        }
        const subjectId = user.id
        const tape = yield* makeSharedProgramTape({
          Message,
          eventId: message => message._tag,
          identity: {
            actor: Processor.AuthenticatedActor.make({ subjectId }),
            actorId: subjectId,
            clientId: foldkitProcessorId,
            originDeviceId: 'computer',
            originatingProcessorId: foldkitProcessorId,
            programId: counterTapeProgramId,
            programVersion: counterTapeProgramVersion,
            sessionId: counterInstantSessionId,
            subjectId,
          },
          makeId: () => crypto.randomUUID(),
          now: () => Date.now(),
          store: makeInstantProgramStore(database),
        })
        const acceptedOccurrences = yield* tape.readAcceptedOccurrences
        const accepted = yield* tape.readAcceptedMessages
        const startModel = yield* projectMessages(accepted)
        const runtime = yield* Effect.orDie(
          Runtime.makeProgramRuntime({
            program: CounterProgram,
            resources: Layer.empty,
            start: Runtime.fromModel(startModel),
          }),
        )
        yield* runtime.initialization
        let appliedSequence = Option.getOrElse(
          Option.map(
            Array.last(acceptedOccurrences),
            occurrence => occurrence.acceptedSequence,
          ),
          () => 0,
        )
        const sendClientInput = (message: Message): void => {
          void Effect.runPromise(
            commitSharedMessage(tape, message, () => runtime.run(message)).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  appliedSequence += 1
                }),
              ),
            ),
          )
        }
        yield* Runtime.makeAttachedFoldkitApplication({
          ClientInput: Message,
          container: document.getElementById('root'),
          program: CounterProgram,
          sendClientInput,
          source: {
            readModel: () => runtime.readModel(),
            subscribe: listener => runtime.observeModel(listener),
          },
          view,
        })
        yield* tape.observeAcceptedOccurrences.pipe(
          Stream.runForEach(occurrences =>
            Effect.forEach(occurrences, occurrence => {
              if (occurrence.acceptedSequence <= appliedSequence) {
                return Effect.void
              }
              if (occurrence.originatingProcessorId === foldkitProcessorId) {
                appliedSequence = occurrence.acceptedSequence
                return Effect.void
              }
              return Effect.gen(function* () {
                const messages = yield* tape.readAcceptedMessages
                const maybeMessage = Array.get(
                  messages,
                  occurrence.acceptedSequence - 1,
                )
                if (Option.isNone(maybeMessage)) {
                  return
                }
                yield* runtime.run(maybeMessage.value, {
                  source: Runtime.fromAcceptedMessage(occurrence.occurrenceId),
                })
                appliedSequence = occurrence.acceptedSequence
              })
            }),
          ),
          Effect.forkChild,
        )
        return yield* Effect.never
      }),
    ),
  )
}
