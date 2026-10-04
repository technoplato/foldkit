import {
  Array,
  Effect,
  Exit,
  Layer,
  Match as M,
  Option,
  Schema as S,
  Stream,
  Tracer,
} from 'effect'
import { expect, vi } from 'vitest'

import { describe, it } from '@effect/vitest'

import * as Command from '../command/index.js'
import { m } from '../message/index.js'
import { make } from '../program/program.js'
import * as Subscription from '../subscription/subscription.js'
import { fromReplay, makeProgramRuntime } from './programRuntime.js'
import type { ProgramRuntimeObserver } from './programRuntime.js'

const ClickedLoad = m('ClickedLoad', { id: S.String })
const Loaded = m('Loaded', { id: S.String })
const ToggledWatching = m('ToggledWatching')
const Message = S.Union([ClickedLoad, Loaded, ToggledWatching])
type Message = typeof Message.Type

const Model = S.Struct({ loaded: S.Array(S.String), isWatching: S.Boolean })
type Model = typeof Model.Type

const Load = Command.define(
  'Load',
  { id: S.String },
  Loaded,
)(({ id }) => Effect.succeed(Loaded({ id })).pipe(Effect.withSpan('ReadStore')))

type UpdateReturn = readonly [Model, ReadonlyArray<Command.Command<Message>>]

const Loader = make({
  id: 'observed-loader',
  version: 7,
  Model,
  Message,
  init: () => [
    Model.make({ loaded: [], isWatching: true }),
    [Load({ id: 'boot' })],
  ],
  update: (model, message) =>
    M.value(message).pipe(
      M.withReturnType<UpdateReturn>(),
      M.tagsExhaustive({
        ClickedLoad: ({ id }) => [model, [Load({ id })]],
        Loaded: ({ id }) => [
          { ...model, loaded: Array.append(model.loaded, id) },
          [],
        ],
        ToggledWatching: () => [
          { ...model, isWatching: !model.isWatching },
          [],
        ],
      }),
    ),
  subscriptions: Subscription.make<Model, Message>()(entry => ({
    watcher: entry(
      { isWatching: S.Boolean },
      {
        modelToDependencies: model => ({ isWatching: model.isWatching }),
        dependenciesToStream: ({ isWatching }) =>
          isWatching ? Stream.never : Stream.empty,
      },
    ),
  })),
})

type SeenSpan = Readonly<{
  name: string
  attributes: ReadonlyMap<string, unknown>
  exit: Exit.Exit<unknown, unknown>
}>

const makeCollectingTracer = (): Readonly<{
  tracer: Tracer.Tracer
  ended: () => ReadonlyArray<SeenSpan>
}> => {
  const ended: Array<SeenSpan> = []
  return {
    tracer: Tracer.make({
      span: options => {
        const span = new Tracer.NativeSpan(options)
        const end = span.end.bind(span)
        span.end = (endTime, exit) => {
          end(endTime, exit)
          ended.push({ name: span.name, attributes: span.attributes, exit })
        }
        return span
      },
    }),
    ended: () => Array.copy(ended),
  }
}

describe('Program runtime observers', () => {
  it.live(
    'connect before boot, so an installed tracer sees the init Command span',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const collecting = makeCollectingTracer()
          const seen: Array<string> = []
          const watch: ProgramRuntimeObserver<Model, Message> = observation =>
            Effect.gen(function* () {
              seen.push(
                `${observation.programId}@${observation.programVersion}`,
              )
              yield* Effect.acquireRelease(
                Effect.sync(() =>
                  observation.installCommandTracer(collecting.tracer),
                ),
                uninstall => Effect.sync(uninstall),
              )
            })
          const runtime = yield* makeProgramRuntime({
            program: Loader,
            resources: Layer.empty,
            observers: [watch],
          })
          yield* runtime.initialization
          expect(seen).toStrictEqual(['observed-loader@7'])
          expect(runtime.programId).toBe('observed-loader')
          expect(runtime.programVersion).toBe(7)
          expect(
            Array.map(collecting.ended(), span => [
              span.name,
              Object.fromEntries(span.attributes),
            ]),
          ).toStrictEqual([['Load', { id: 'boot' }]])
        }),
      ),
  )

  it.live(
    'reach installed tracers beside the tracer in context, with Command spans only',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const inContext = makeCollectingTracer()
          const installed = makeCollectingTracer()
          const runtime = yield* makeProgramRuntime({
            program: Loader,
            resources: Layer.succeed(Tracer.Tracer, inContext.tracer),
          })
          yield* runtime.initialization
          const uninstall = runtime.installCommandTracer(installed.tracer)
          yield* runtime.run(ClickedLoad({ id: 'first' }))
          uninstall()
          yield* runtime.run(ClickedLoad({ id: 'second' }))

          expect(Array.map(installed.ended(), span => span.name)).toStrictEqual(
            ['Load'],
          )
          expect(
            Array.map(installed.ended(), span => Exit.isSuccess(span.exit)),
          ).toStrictEqual([true])
          expect(Array.map(inContext.ended(), span => span.name)).toStrictEqual(
            ['ReadStore', 'Load', 'ReadStore', 'Load', 'ReadStore', 'Load'],
          )
          expect(runtime.readModel().loaded).toStrictEqual([
            'boot',
            'first',
            'second',
          ])
        }),
      ),
  )

  it.live(
    'close after Subscriptions stop, so they see the last diagnostic',
    () =>
      Effect.gen(function* () {
        const seen: Array<string> = []
        const watch: ProgramRuntimeObserver<Model, Message> = observation =>
          Effect.gen(function* () {
            yield* Effect.acquireRelease(
              Effect.sync(() =>
                observation.observeDiagnostics(diagnostic => {
                  seen.push(diagnostic._tag)
                }),
              ),
              stopObserving => Effect.sync(stopObserving),
            )
            yield* Effect.addFinalizer(() =>
              Effect.sync(() => {
                seen.push('ObserverClosed')
              }),
            )
          })
        yield* Effect.scoped(
          Effect.gen(function* () {
            const runtime = yield* makeProgramRuntime({
              program: Loader,
              resources: Layer.empty,
              observers: [watch],
            })
            yield* Effect.promise(() =>
              vi.waitFor(() => {
                expect(runtime.readDiagnostics()).toHaveLength(1)
              }),
            )
          }),
        )
        expect(seen).toStrictEqual([
          'StartedSubscription',
          'StoppedSubscription',
          'ObserverClosed',
        ])
      }),
  )

  it.live('report an observer that dies and keep the Program running', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const consoleError = vi
          .spyOn(console, 'error')
          .mockImplementation(() => undefined)
        const runtime = yield* makeProgramRuntime({
          program: Loader,
          resources: Layer.empty,
          observers: [() => Effect.die(new Error('observer exploded'))],
        })
        yield* runtime.run(ClickedLoad({ id: 'after' }))
        expect(runtime.readModel().loaded).toContain('after')
        expect(consoleError).toHaveBeenCalledWith(
          '[foldkit] A Program runtime observer failed:',
          expect.stringContaining('observer exploded'),
        )
        consoleError.mockRestore()
      }),
    ),
  )
})

describe('Program runtime transitions', () => {
  it.live('measure update for live transitions and not for replayed ones', () =>
    Effect.gen(function* () {
      const tape = yield* Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* makeProgramRuntime({
            program: Loader,
            resources: Layer.empty,
          })
          yield* runtime.initialization
          yield* runtime.run(ToggledWatching())
          const transitions = runtime.journal.read().transitions
          expect(transitions).toHaveLength(2)
          Array.forEach(transitions, transition => {
            expect(transition.updateDurationMs).toBeGreaterThanOrEqual(0)
          })
          return runtime.replay.readTape()
        }),
      )
      yield* Effect.scoped(
        Effect.gen(function* () {
          const resumed = yield* makeProgramRuntime({
            program: Loader,
            resources: Layer.empty,
            start: fromReplay(tape),
          })
          expect(
            Array.map(
              resumed.journal.read().transitions,
              transition => transition.updateDurationMs,
            ),
          ).toStrictEqual([undefined, undefined])
          expect(
            Option.isSome(Array.head(resumed.journal.read().transitions)),
          ).toBe(true)
        }),
      )
    }),
  )
})
