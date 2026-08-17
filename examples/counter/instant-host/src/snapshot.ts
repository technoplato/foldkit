import {
  CounterProgram,
  type CounterWindowTape,
  Decrement,
  Increment,
  type Message,
  type Model,
  Reset,
} from 'counter-core-example'
import { Effect, Exit, Layer, Match as M, Scope } from 'effect'
import { Runtime } from 'foldkit'

import {
  InstantLogMessageRecord,
  SnapshotLogError,
  type SnapshotLogTransport,
  commitSnapshotLog,
  observeRemoteSnapshotLog,
  tapeLinkFromOutcome,
} from '@foldkit/instant/browser'

/** Local-first Instant write of one Counter Message. */
export type CounterSnapshotCommit = Readonly<{
  link: 'offline' | 'queued' | 'delivered'
  model: Model
}>

/** Reads the count snapshot. Does not fold the Message log. */
export const readCounterSnapshotModel = (
  transport: SnapshotLogTransport,
): Effect.Effect<Model, SnapshotLogError> =>
  Effect.map(transport.read(), state => ({ count: state.snapshot.value }))

/** Decodes an Instant tag into a Counter Message. Unknown tags fail. */
export const decodeCounterLogMessage = (
  record: InstantLogMessageRecord,
): Effect.Effect<Message, SnapshotLogError> =>
  M.value(record.tag).pipe(
    M.when('Decrement', () => Effect.succeed(Decrement())),
    M.when('Increment', () => Effect.succeed(Increment())),
    M.when('Reset', () => Effect.succeed(Reset())),
    M.orElse(() =>
      Effect.fail(
        new SnapshotLogError({
          cause: new Error(`Unknown Counter Message tag ${record.tag}.`),
          operation: 'Decode',
        }),
      ),
    ),
  )

/** Writes one Counter Message after the local Model already updated. */
export const commitCounterSnapshotMessage = (
  transport: SnapshotLogTransport,
  processorId: string,
  currentValue: number,
  message: Message,
): Effect.Effect<CounterSnapshotCommit, SnapshotLogError> =>
  Effect.map(
    commitSnapshotLog({
      applyLocal: value => {
        const [next] = CounterProgram.update({ count: value }, message)
        return next.count
      },
      currentValue,
      processorId,
      tag: message._tag,
      transport,
    }),
    commit => ({
      link: tapeLinkFromOutcome(commit.outcome),
      model: { count: commit.snapshot.value },
    }),
  )

/** Opens a window tape over a count snapshot and a live Message log. */
export const openSnapshotCounterWindowTape = (
  transport: SnapshotLogTransport,
  processorId: string,
  onObserveFailed: (error: string) => void = () => undefined,
): Promise<CounterWindowTape> => {
  const scope = Effect.runSync(Scope.make())
  return Effect.runPromise(
    Effect.gen(function* () {
      const state = yield* transport.read()
      const programRuntime = yield* Runtime.makeProgramRuntime({
        program: CounterProgram,
        resources: Layer.empty,
        start: Runtime.fromModel({ count: state.snapshot.value }),
      })
      yield* programRuntime.initialization
      yield* observeRemoteSnapshotLog(
        transport,
        processorId,
        record =>
          decodeCounterLogMessage(record).pipe(
            Effect.flatMap(message =>
              Effect.asVoid(
                programRuntime.run(message, {
                  source: Runtime.fromAcceptedMessage(record.id),
                }),
              ),
            ),
          ),
        state.snapshot,
      ).pipe(
        Effect.tapError(error =>
          Effect.sync(() => {
            if (error instanceof Error && error.message !== '') {
              onObserveFailed(error.message)
              return
            }
            onObserveFailed('Instant could not observe the Counter log.')
          }),
        ),
        Effect.ignore,
        Effect.forkIn(scope),
      )
      return {
        readModel: () => programRuntime.readModel(),
        send: (message: Message) =>
          Effect.runPromise(
            Effect.gen(function* () {
              const current = programRuntime.readModel()
              yield* programRuntime.run(message)
              yield* commitCounterSnapshotMessage(
                transport,
                processorId,
                current.count,
                message,
              ).pipe(Effect.ignore)
            }),
          ),
        stop: () => {
          const closing = Effect.runPromise(Scope.close(scope, Exit.void))
          closing.then(
            () => undefined,
            () => undefined,
          )
        },
        subscribe: (listener: (model: Model) => void) =>
          programRuntime.observeModel(listener),
      }
    }).pipe(Effect.provideService(Scope.Scope, scope)),
  )
}
