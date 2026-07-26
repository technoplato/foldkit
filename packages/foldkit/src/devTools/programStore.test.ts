import {
  Array,
  Effect,
  Function,
  Layer,
  Match as M,
  Option,
  Schema as S,
  Stream,
  SubscriptionRef,
} from 'effect'
import { expect } from 'vitest'

import { describe, it } from '@effect/vitest'

import * as Command from '../command/index.js'
import { m } from '../message/index.js'
import { make } from '../program/program.js'
import { makeProgramRuntime } from '../runtime/programRuntime.js'
import { createProgramDevToolsStore } from './programStore.js'
import { type DevToolsStore, INIT_INDEX, type StoreState } from './store.js'

const CompletedInitialize = m('CompletedInitialize')
const ClickedIncrement = m('ClickedIncrement')
const ClickedDecrement = m('ClickedDecrement')
const Message = S.Union([
  CompletedInitialize,
  ClickedIncrement,
  ClickedDecrement,
])
type Message = typeof Message.Type

const Model = S.Struct({ count: S.Number })
type Model = typeof Model.Type

const FinishInitialize = Command.define(
  'FinishInitialize',
  CompletedInitialize,
)(Effect.succeed(CompletedInitialize()))

const makeCounter = (onUpdate: () => void = Function.constVoid) =>
  make({
    id: 'program-devtools-counter',
    version: 1,
    Model,
    Message,
    init: () => [Model.make({ count: 0 }), [FinishInitialize()]],
    update: (model, message) => {
      onUpdate()
      return M.value(message).pipe(
        M.withReturnType<
          readonly [Model, ReadonlyArray<Command.Command<Message>>]
        >(),
        M.tagsExhaustive({
          CompletedInitialize: () => [
            Model.make({ count: model.count + 1 }),
            [],
          ],
          ClickedIncrement: () => [Model.make({ count: model.count + 1 }), []],
          ClickedDecrement: () => [Model.make({ count: model.count - 1 }), []],
        }),
      )
    },
  })

const waitForState = (
  store: DevToolsStore,
  predicate: (state: StoreState) => boolean,
): Effect.Effect<StoreState> =>
  SubscriptionRef.changes(store.stateRef).pipe(
    Stream.filter(predicate),
    Stream.runHead,
    Effect.map(Option.getOrThrow),
  )

describe('createProgramDevToolsStore', () => {
  it.effect(
    'presents initialization and live history without replaying update',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          let updateInvocationCount = 0
          const Program = makeCounter(() => {
            updateInvocationCount += 1
          })
          const renderedModels: Array<Model> = []
          let didMarkRenderPending = false
          const runtime = yield* makeProgramRuntime({
            program: Program,
            resources: Layer.empty,
          })
          yield* runtime.initialization
          const store = yield* createProgramDevToolsStore({
            runtime,
            bridge: {
              render: model =>
                Effect.sync(() => {
                  renderedModels.push(S.decodeUnknownSync(Model)(model))
                }),
              markRenderPending: Effect.sync(() => {
                didMarkRenderPending = true
              }),
            },
          })

          yield* runtime.run(ClickedIncrement())
          const state = yield* waitForState(
            store,
            nextState => nextState.entries.length === 2,
          )

          expect(Array.map(state.entries, entry => entry.tag)).toStrictEqual([
            'CompletedInitialize',
            'ClickedIncrement',
          ])
          expect(
            Array.map(state.entries, entry =>
              Option.getOrThrow(entry.maybeSource),
            ),
          ).toStrictEqual([
            { _tag: 'Command', name: 'FinishInitialize' },
            { _tag: 'Host' },
          ])
          expect(updateInvocationCount).toBe(2)

          expect(yield* store.getModelAtIndex(INIT_INDEX)).toStrictEqual({
            count: 0,
          })
          expect(yield* store.getModelAtIndex(0)).toStrictEqual({ count: 1 })
          expect(yield* store.getModelAtIndex(1)).toStrictEqual({ count: 2 })
          expect(
            Array.fromIterable((yield* store.getDiffAtIndex(1)).changedPaths),
          ).toStrictEqual(['root.count'])
          yield* store.jumpTo(0)
          yield* store.resume

          expect(renderedModels).toStrictEqual([{ count: 1 }])
          expect(didMarkRenderPending).toBe(true)
          expect(updateInvocationCount).toBe(2)
        }),
      ),
  )

  it.effect(
    'keeps excluded and evicted transitions in Program history only',
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* makeProgramRuntime({
            program: makeCounter(),
            resources: Layer.empty,
          })
          yield* runtime.initialization
          const store = yield* createProgramDevToolsStore({
            runtime,
            bridge: {
              render: () => Effect.void,
              markRenderPending: Effect.void,
            },
            excludeFromHistory: ['ClickedDecrement'],
            maxEntries: 2,
          })

          yield* runtime.run(ClickedIncrement())
          yield* runtime.run(ClickedDecrement())
          yield* runtime.run(ClickedIncrement())
          const state = yield* waitForState(
            store,
            nextState =>
              nextState.entries.length === 2 &&
              Option.exists(
                nextState.maybeLatestModel,
                model => S.decodeUnknownSync(Model)(model).count === 2,
              ),
          )

          expect(runtime.journal.read().transitions).toHaveLength(4)
          expect(Array.map(state.entries, entry => entry.tag)).toStrictEqual([
            'ClickedIncrement',
            'ClickedIncrement',
          ])
          expect(state.startIndex).toBe(1)
          expect(yield* store.getReplayIndices).toStrictEqual([
            INIT_INDEX,
            1,
            2,
          ])
          expect(yield* store.getModelAtIndex(1)).toStrictEqual({ count: 2 })
          expect(yield* store.getModelAtIndex(2)).toStrictEqual({ count: 2 })
        }),
      ),
  )

  it.effect('clears only the presentation and preserves mount metadata', () =>
    Effect.scoped(
      Effect.gen(function* () {
        const runtime = yield* makeProgramRuntime({
          program: makeCounter(),
          resources: Layer.empty,
        })
        yield* runtime.initialization
        const store = yield* createProgramDevToolsStore({
          runtime,
          bridge: {
            render: () => Effect.void,
            markRenderPending: Effect.void,
          },
          initialMountStarts: [{ name: 'MountCounter' }],
        })

        yield* runtime.run(ClickedIncrement())
        yield* waitForState(store, state => state.entries.length === 2)
        yield* store.attachRenderedMounts(
          [{ name: 'MountResult' }],
          [{ name: 'UnmountPreviousResult' }],
        )
        const beforeClear = yield* SubscriptionRef.get(store.stateRef)

        expect(beforeClear.initMountStarts).toStrictEqual([
          { name: 'MountCounter' },
        ])
        expect(Option.getOrThrow(Array.last(beforeClear.entries))).toEqual(
          expect.objectContaining({
            mountStarts: [{ name: 'MountResult' }],
            mountEnds: [{ name: 'UnmountPreviousResult' }],
          }),
        )

        yield* store.clear
        const afterClear = yield* SubscriptionRef.get(store.stateRef)
        expect(afterClear.entries).toStrictEqual([])
        expect(runtime.journal.read().transitions).toHaveLength(2)

        yield* runtime.run(ClickedIncrement())
        const afterNextMessage = yield* waitForState(
          store,
          state => state.entries.length === 1,
        )
        expect(
          Array.map(afterNextMessage.entries, entry => entry.tag),
        ).toStrictEqual(['ClickedIncrement'])
        expect(yield* store.getModelAtIndex(0)).toStrictEqual({ count: 3 })
        expect(runtime.journal.read().transitions).toHaveLength(3)
      }),
    ),
  )
})
