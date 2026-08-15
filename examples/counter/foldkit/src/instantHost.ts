import {
  CounterProgram,
  type CounterWindowActions,
  type CounterWindowModel,
  type CounterWindowTape,
  FailedCounterSession,
  Message,
  type Model,
  SignedInCounterSession,
  counterInstantSessionId,
  counterProcessorIds,
  counterTapeIdentityFields,
  describeCounterWindowError,
  startCounterWindowRuntime,
  uri,
} from 'counter-core-example'
import { Array, Effect, Exit, Layer, Option, Scope, Stream } from 'effect'
import { Processor, Runtime } from 'foldkit'

import {
  InstantProgramSchema,
  makeInstantProgramStore,
} from '@foldkit/instant/browser'
import {
  commitSharedMessage,
  makeSharedProgramTape,
} from '@foldkit/instant/sharing'
import { init } from '@instantdb/core'

import { counterDemoSessionPath } from './demoSessionPath.js'
import { view } from './view.js'

const foldkitProcessorId = counterProcessorIds.foldkit

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

const readJsonToken = async (response: Response): Promise<string> => {
  if (!response.ok) {
    throw new Error('Instant could not mint the Counter demo session.')
  }
  const body: unknown = await response.json()
  if (
    typeof body !== 'object' ||
    body === null ||
    !('token' in body) ||
    typeof body.token !== 'string' ||
    body.token === ''
  ) {
    throw new Error('Instant could not mint the Counter demo session.')
  }
  return body.token
}

/** Signs the Foldkit Processor into the shared Counter Instant account. */
export const signInCounterDemoSession = async (
  database: ReturnType<typeof init<typeof InstantProgramSchema>>,
): Promise<void> => {
  const existing = await database.getAuth()
  if (existing !== null) {
    return
  }
  const response = await fetch(counterDemoSessionPath, {
    credentials: 'same-origin',
  })
  const token = await readJsonToken(response)
  await database.auth.signInWithToken(token)
}

/** Paints Starting or Failed host chrome. Ready returns false so Foldkit can draw. */
export const paintCounterHostStatus = (
  container: HTMLElement,
  snapshot: CounterWindowModel,
  actions: CounterWindowActions,
): boolean => {
  if (snapshot._tag === 'ReadyWindow') {
    return false
  }
  container.replaceChildren()
  const status = document.createElement('p')
  if (snapshot._tag === 'StartingWindow') {
    status.textContent = 'Starting Instant Counter…'
    container.append(status)
    return true
  }
  status.textContent = snapshot.error
  const retry = document.createElement('button')
  retry.type = 'button'
  retry.textContent = 'Sign in'
  retry.addEventListener('click', () => {
    actions.signIn()
  })
  container.append(status, retry)
  return true
}

const openInstantWindowTape = (
  database: ReturnType<typeof init<typeof InstantProgramSchema>>,
  userId: string,
): Promise<CounterWindowTape> => {
  const scope = Effect.runSync(Scope.make())
  return Effect.runPromise(
    Effect.gen(function* () {
      const tape = yield* makeSharedProgramTape({
        Message,
        eventId: message => message._tag,
        identity: {
          actor: Processor.AuthenticatedActor.make({ subjectId: userId }),
          ...counterTapeIdentityFields(
            foldkitProcessorId,
            userId,
            counterInstantSessionId,
          ),
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
      return {
        readModel: () => runtime.readModel(),
        send: (message: Message) =>
          Effect.runPromise(
            commitSharedMessage(tape, message, () => runtime.run(message)).pipe(
              Effect.asVoid,
            ),
          ),
        stop: () => {
          const closing = Effect.runPromise(Scope.close(scope, Exit.void))
          closing.then(
            () => undefined,
            () => undefined,
          )
        },
        subscribe: (listener: (model: Model) => void) =>
          runtime.observeModel(listener),
      }
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )
}

const attachProduct = (
  container: HTMLElement,
  runtime: ReturnType<typeof startCounterWindowRuntime>,
): (() => void) => {
  const scope = Effect.runSync(Scope.make())
  const attached = Effect.runPromise(
    Runtime.makeAttachedFoldkitApplication({
      ClientInput: Message,
      container,
      program: CounterProgram,
      sendClientInput: message => {
        runtime.enqueue(message)
      },
      source: {
        readModel: () => {
          const snapshot = runtime.getSnapshot(uri)
          if (snapshot._tag === 'ReadyWindow') {
            return { count: snapshot.count }
          }
          return { count: 0 }
        },
        subscribe: listener =>
          runtime.subscribe(() => {
            const snapshot = runtime.getSnapshot(uri)
            if (snapshot._tag === 'ReadyWindow') {
              listener({ count: snapshot.count })
            }
          }),
      },
      view,
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )
  attached.then(
    () => undefined,
    () => undefined,
  )
  return () => {
    const closing = Effect.runPromise(Scope.close(scope, Exit.void))
    closing.then(
      () => undefined,
      () => undefined,
    )
  }
}

/** Starts the Foldkit Processor on the live Instant Counter tape. */
export const startInstantCounter = (appId: string): void => {
  const container = document.getElementById('root')
  if (container === null) {
    throw new Error('Root element not found')
  }
  const database = init({ appId, schema: InstantProgramSchema })
  const runtime = startCounterWindowRuntime({
    openTape: userId => openInstantWindowTape(database, userId),
    signIn: async () => {
      try {
        await signInCounterDemoSession(database)
        const user = await database.getAuth()
        if (user === null) {
          return FailedCounterSession.make({
            error: 'Instant has no Counter demo user.',
          })
        }
        return SignedInCounterSession.make({ userId: user.id })
      } catch (error) {
        return FailedCounterSession.make({
          error: describeCounterWindowError(error),
        })
      }
    },
  })
  let detach: (() => void) | undefined
  const render = (): void => {
    const snapshot = runtime.getSnapshot(uri)
    const painted = paintCounterHostStatus(
      container,
      snapshot,
      runtime.actions(uri),
    )
    if (painted) {
      if (detach !== undefined) {
        detach()
        detach = undefined
      }
      return
    }
    if (detach === undefined) {
      detach = attachProduct(container, runtime)
    }
  }
  runtime.subscribe(render)
  render()
}
