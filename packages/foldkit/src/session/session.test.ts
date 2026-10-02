import {
  Duration,
  Effect,
  Equal,
  Match as M,
  Option,
  Schema as S,
  SchemaTransformation,
} from 'effect'
import { describe, expect, it } from 'vitest'

import * as ActionMenu from '../actionMenu/actionMenu.js'
import * as Catalog from '../catalog/catalog.js'
import { NotFound } from '../navigation/declaration.js'
import * as Declaration from '../navigation/declaration.js'
import { NavigationStack, stackAtRoot } from '../navigation/structure.js'
import { compose as composeProgram } from '../program/compose.js'
import { make } from '../program/program.js'
import * as Route from '../route/parser.js'
import { start } from '../runtime/start.js'
import { Memory, makeMemoryStore } from '../runtime/syncEngine.js'
import { ts } from '../schema/index.js'
import {
  KeepNavigationLocal,
  MirrorNavigation,
  SessionSettings,
  SessionState,
  compose,
} from './session.js'

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
  id: 'session-counter',
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
  navigation: Declaration.screens({
    root: Declaration.rootScreen(Counter, Route.here),
  }),
  synchronization: {
    messageCategory: () => 'Domain',
    projectDomain: model => model,
  },
})

const App = ActionMenu.compose({ of: compose({ of: CounterProgram }) })
type AppModel = typeof App.Model.Type

const AppDestination = S.Union([
  Counter,
  SessionSettings,
  NotFound,
  ActionMenu.ActionMenu,
])
type AppDestination = typeof AppDestination.Type

const AppModelSchema = S.Struct({
  count: S.Number,
  session: SessionState,
  navigation: NavigationStack(AppDestination),
})

const CountRow = S.Struct({
  id: S.String,
  value: S.Number,
  asOf: S.String,
  at: S.Number,
})

const AppSnapshot = CountRow.pipe(
  S.decodeTo(
    AppModelSchema,
    SchemaTransformation.transform({
      decode: (row): typeof AppModelSchema.Encoded => ({
        count: row.value,
        session: { mode: 'Mirror', generation: 0 },
        navigation: stackAtRoot<AppDestination>(Counter()),
      }),
      encode: model => ({ id: 'count', value: model.count, asOf: '', at: 0 }),
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

const Synced = composeProgram.sync({
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

const modeOf = (model: SyncedModel): string => readyApp(model).session.mode

const run = <A>(effect: Effect.Effect<A, unknown, never>): Promise<A> =>
  Effect.runPromise(effect)

const settleAttempts = 200

const eventually = <A>(read: () => A, expected: A): Effect.Effect<void> =>
  Effect.gen(function* () {
    for (
      let attempt = 0;
      attempt < settleAttempts && !Equal.equals(read(), expected);
      attempt += 1
    ) {
      yield* Effect.sleep(Duration.millis(1))
    }
    expect(read()).toEqual(expected)
  })

describe('Session.compose', () => {
  it('switches every Processor at once, so two tabs never disagree', async () => {
    await run(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          const laptop = yield* start({
            program: Synced,
            sync: Memory({ processor: 'react-laptop', store }),
          })
          const phone = yield* start({
            program: Synced,
            sync: Memory({ processor: 'expo-phone', store }),
          })
          yield* laptop.run(KeepNavigationLocal())
          expect(modeOf(laptop.readModel())).toBe('SharedDomain')
          yield* eventually(() => modeOf(phone.readModel()), 'SharedDomain')

          yield* laptop.run(ActionMenu.OpenedActionMenu())
          expect(isMenuOpen(laptop.readModel())).toBe(true)
          yield* laptop.run(Increment())
          yield* eventually(() => readyApp(phone.readModel()).count, 1)
          expect(isMenuOpen(phone.readModel())).toBe(false)

          yield* phone.run(MirrorNavigation())
          yield* eventually(() => modeOf(laptop.readModel()), 'Mirror')
          yield* phone.run(ActionMenu.OpenedActionMenu())
          expect(isMenuOpen(phone.readModel())).toBe(true)
          yield* phone.run(ActionMenu.DismissedActionMenu())
          yield* eventually(() => isMenuOpen(laptop.readModel()), false)
        }),
      ),
    )
  })

  it('folds the same mode on a Processor that joins later', async () => {
    await run(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          const laptop = yield* start({
            program: Synced,
            sync: Memory({ processor: 'react-laptop', store }),
          })
          yield* laptop.run(KeepNavigationLocal())
          yield* laptop.run(ActionMenu.OpenedActionMenu())
          const tablet = yield* start({
            program: Synced,
            sync: Memory({ processor: 'expo-tablet', store }),
          })
          expect(modeOf(tablet.readModel())).toBe('SharedDomain')
          expect(isMenuOpen(tablet.readModel())).toBe(false)
        }),
      ),
    )
  })

  it('applies a late Navigation row under the policy at its position', async () => {
    await run(
      Effect.scoped(
        Effect.gen(function* () {
          const store = makeMemoryStore()
          store.messages = [
            {
              id: 'switch',
              body: JSON.stringify(KeepNavigationLocal()),
              from: 'react-laptop',
              createdAtMs: 2_000,
            },
          ]
          const engine = Memory({ processor: 'expo-tablet', store })
          const tablet = yield* start({ program: Synced, sync: engine })
          expect(modeOf(tablet.readModel())).toBe('SharedDomain')
          engine.injectMessage({
            id: 'late-open',
            body: JSON.stringify(ActionMenu.OpenedActionMenu()),
            from: 'expo-phone',
            createdAtMs: 1_000,
          })
          yield* eventually(() => isMenuOpen(tablet.readModel()), true)
          expect(modeOf(tablet.readModel())).toBe('SharedDomain')
        }),
      ),
    )
  })

  it('offers only the mode the session is not in', () => {
    const [model] = App.init()
    const availability = (tag: string) =>
      Option.map(
        Option.fromNullishOr(
          Catalog.entries(App.catalog, model).find(entry => entry.tag === tag),
        ),
        entry => entry.availability._tag,
      )
    expect(availability('MirrorNavigation')).toEqual(Option.some('Disabled'))
    expect(availability('KeepNavigationLocal')).toEqual(Option.some('Enabled'))
  })
})
