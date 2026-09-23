import {
  Effect,
  Match as M,
  Option,
  Schema as S,
  SchemaTransformation,
} from 'effect'
import { describe, expect, it } from 'vitest'

import * as ActionMenu from '../actionMenu/actionMenu.js'
import * as Catalog from '../catalog/catalog.js'
import { NavigationStack, stackAtRoot } from '../navigation/structure.js'
import { compose } from '../program/compose.js'
import { make } from '../program/program.js'
import { ts } from '../schema/index.js'
import {
  Follow,
  Follower,
  SessionPolicy,
  SharedDomain,
} from '../synchronization/synchronization.js'
import { start } from './start.js'
import { Memory, makeMemoryStore } from './syncEngine.js'

const CounterModel = S.Struct({ count: S.Number })
type CounterModel = typeof CounterModel.Type

const Increment = Catalog.action('Increment', {
  what: 'Increments the count by one',
  why: 'The person wants a higher count',
  meta: { label: '+', keys: ['+'] },
})
const catalog = Catalog.make([Increment])
type CounterMessage = typeof catalog.Message.Type

const Counter = ts('Counter')

const CounterProgram = make({
  id: 'sync-modes-counter',
  version: 1,
  Model: CounterModel,
  Message: catalog.Message,
  init: () => [{ count: 0 }, []],
  update: (model: CounterModel, message: CounterMessage) =>
    M.value(message).pipe(
      M.withReturnType<readonly [CounterModel, ReadonlyArray<never>]>(),
      M.tagsExhaustive({
        Increment: () => [{ count: model.count + 1 }, []],
      }),
    ),
  catalog,
  navigation: { Destination: Counter, root: Counter() },
})

const App = ActionMenu.compose({ of: CounterProgram })
type AppModel = typeof App.Model.Type

const CountRow = S.Struct({
  id: S.String,
  value: S.Number,
  asOf: S.String,
  at: S.Number,
})

const CountProjection = CountRow.pipe(
  S.decodeTo(
    S.Struct({ count: S.Number }),
    SchemaTransformation.transform({
      decode: row => ({ count: row.value }),
      encode: model => ({ id: 'count', value: model.count, asOf: '', at: 0 }),
    }),
  ),
)

const AppModelSchema = S.Struct({
  count: S.Number,
  navigation: NavigationStack(S.Union([Counter, ActionMenu.ActionMenu])),
})

const AppSnapshot = CountProjection.pipe(
  S.decodeTo(
    AppModelSchema,
    SchemaTransformation.transform({
      decode: ({ count }) => ({ count, navigation: stackAtRoot(Counter()) }),
      encode: model => ({ count: model.count }),
    }),
  ),
)

const MessageRow = S.Struct({
  id: S.String,
  body: S.String,
  from: S.String,
  createdAtMs: S.Number,
})

const MessageWire = MessageRow.pipe(
  S.decodeTo(
    S.fromJsonString(App.Message),
    SchemaTransformation.transform({
      decode: row => row.body,
      encode: body => ({ id: '', body, from: '', createdAtMs: 0 }),
    }),
  ),
)

const Synced = compose.sync({
  of: App,
  snapshot: AppSnapshot,
  message: MessageWire,
})

type SyncedModel = ReturnType<typeof Synced.init>[0]

const readyApp = (model: SyncedModel): AppModel => {
  if (model._tag !== 'Ready') {
    throw new Error(`Expected Ready, got ${model._tag}`)
  }
  const { _tag: _ready, ...app } = model
  return app
}

const isMenuOpen = (model: SyncedModel): boolean =>
  Option.isSome(ActionMenu.menuOf(readyApp(model).navigation))

const run = <A>(effect: Effect.Effect<A, unknown, never>): Promise<A> =>
  Effect.runPromise(effect)

describe('Runtime.start synchronization modes', () => {
  it('mirrors the action menu to every Processor by default', async () => {
    await run(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          const laptop = yield* start({
            program: Synced,
            sync: Memory({ processor: 'laptop', store }),
          })
          const phone = yield* start({
            program: Synced,
            sync: Memory({ processor: 'phone', store }),
          })
          yield* laptop.run(ActionMenu.OpenedActionMenu())
          expect(isMenuOpen(laptop.readModel())).toBe(true)
          expect(isMenuOpen(phone.readModel())).toBe(true)
          yield* laptop.run(Increment())
          expect(readyApp(phone.readModel()).count).toBe(1)
        }),
      ),
    )
  })

  it('keeps each menu local under SharedDomain while the count syncs', async () => {
    await run(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          const policy = SessionPolicy.make({
            generation: 0,
            mode: SharedDomain.make({}),
          })
          const laptop = yield* start({
            program: Synced,
            sync: Memory({ processor: 'laptop', store }),
            policy,
          })
          const phone = yield* start({
            program: Synced,
            sync: Memory({ processor: 'phone', store }),
            policy,
          })
          yield* laptop.run(ActionMenu.OpenedActionMenu())
          expect(isMenuOpen(laptop.readModel())).toBe(true)
          expect(isMenuOpen(phone.readModel())).toBe(false)
          yield* phone.run(Increment())
          expect(readyApp(laptop.readModel()).count).toBe(1)
          expect(isMenuOpen(laptop.readModel())).toBe(true)
        }),
      ),
    )
  })

  it('lets followers watch a leader and stops observers from steering', async () => {
    await run(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          const policy = SessionPolicy.make({
            generation: 0,
            mode: Follow.make({
              leaderProcessorId: 'presenter',
              followers: [
                Follower.make({ control: 'Observe', processorId: 'projector' }),
              ],
            }),
          })
          const presenter = yield* start({
            program: Synced,
            sync: Memory({ processor: 'presenter', store }),
            policy,
          })
          const projector = yield* start({
            program: Synced,
            sync: Memory({ processor: 'projector', store }),
            policy,
          })
          const bystander = yield* start({
            program: Synced,
            sync: Memory({ processor: 'bystander', store }),
            policy,
          })
          yield* presenter.run(ActionMenu.OpenedActionMenu())
          expect(isMenuOpen(projector.readModel())).toBe(true)
          expect(isMenuOpen(bystander.readModel())).toBe(false)
          yield* projector.run(ActionMenu.DismissedActionMenu())
          expect(isMenuOpen(projector.readModel())).toBe(true)
          expect(isMenuOpen(presenter.readModel())).toBe(true)
          yield* bystander.run(Increment())
          expect(readyApp(presenter.readModel()).count).toBe(1)
          expect(readyApp(projector.readModel()).count).toBe(1)
        }),
      ),
    )
  })

  it('refuses SharedDomain for a Program without a Message classifier', async () => {
    const Plain = compose.sync({
      of: CounterProgram,
      snapshot: CountProjection,
      message: MessageRow.pipe(
        S.decodeTo(
          S.fromJsonString(catalog.Message),
          SchemaTransformation.transform({
            decode: row => row.body,
            encode: body => ({ id: '', body, from: '', createdAtMs: 0 }),
          }),
        ),
      ),
    })
    const exit = await Effect.runPromiseExit(
      Effect.scoped(
        start({
          program: Plain,
          sync: Memory({ processor: 'laptop' }),
          policy: SessionPolicy.make({
            generation: 0,
            mode: SharedDomain.make({}),
          }),
        }),
      ),
    )
    expect(exit._tag).toBe('Failure')
  })
})
