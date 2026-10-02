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
import { type ProgramHandle, bind } from '../interaction/bind.js'
import { keyInput } from '../interaction/interaction.js'
import { compose as composeProgram } from '../program/compose.js'
import { make } from '../program/program.js'
import { Text } from '../renderers/elements.js'
import * as Route from '../route/parser.js'
import { startHandle } from '../runtime/handle.js'
import { Memory, makeMemoryStore } from '../runtime/syncEngine.js'
import { ts } from '../schema/index.js'
import * as Session from '../session/session.js'
import { notFoundScreen } from './compose.js'
import * as Declaration from './declaration.js'
import { Launch, Link, NavigatedBack, OpenedUri } from './message.js'
import { NavigationStack, stackAtRoot } from './structure.js'

// PROGRAM

const CounterModel = S.Struct({ count: S.Number })
type CounterModel = typeof CounterModel.Type

const Increment = Catalog.action('Increment', {
  what: 'Increments the count by one',
  why: 'The person wants a higher count',
  meta: { label: '+', keys: ['+'] },
})
const Reset = Catalog.action('Reset', {
  what: 'Sets the count to 0',
  why: 'The person wants to start over',
  meta: { label: 'Reset', keys: ['r'] },
})
const catalog = Catalog.make([Increment, Reset])
type CounterMessage = typeof catalog.Message.Type

const Counter = ts('Counter')
type Counter = typeof Counter.Type

const counterNavigation = Declaration.make<CounterModel, Counter>({
  slug: Declaration.Slug.make('counter'),
  Destination: Counter,
  root: Counter(),
  routes: [
    Declaration.rootRoute(
      Route.caseOf(
        Route.here,
        Declaration.tagCase<Counter, Counter>(S.is(Counter), Counter),
      ),
      { title: () => 'Counter' },
    ),
  ],
})

const CounterProgram = make({
  id: 'composition-counter',
  version: 1,
  Model: CounterModel,
  Message: catalog.Message,
  init: () => [{ count: 0 }, []],
  update: (model: CounterModel, message: CounterMessage) =>
    M.value(message).pipe(
      M.withReturnType<readonly [CounterModel, ReadonlyArray<never>]>(),
      M.tagsExhaustive({
        Increment: () => [{ count: model.count + 1 }, []],
        Reset: () => [{ count: 0 }, []],
      }),
    ),
  catalog,
  navigation: counterNavigation,
  screen: (model: CounterModel) => Text(String(model.count)),
  synchronization: {
    messageCategory: () => 'Domain',
    projectDomain: model => model,
  },
})

const App = ActionMenu.compose({ of: Session.compose({ of: CounterProgram }) })
type AppMessage = typeof App.Message.Type

const handleOf = <Model, Message>(
  program: Readonly<{
    init: () => readonly [Model, ReadonlyArray<unknown>]
    update: (
      model: Model,
      message: Message,
    ) => readonly [Model, ReadonlyArray<unknown>]
  }>,
): ProgramHandle<Model, Message> => {
  let current = program.init()[0]
  const listeners = new Set<() => void>()
  return {
    readModel: () => current,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    send: message => {
      current = program.update(current, message)[0]
      listeners.forEach(listener => listener())
    },
    stop: () => Promise.resolve(),
  }
}

const boundApp = () => bind(App, handleOf(App))

const uriOf = (bound: ReturnType<typeof boundApp>): string =>
  Option.match(bound.navigation(), {
    onNone: () => 'no plan',
    onSome: plan => plan.uri,
  })

// APP

describe('a composed App', () => {
  it('starts at the root URI its child declares', () => {
    expect(uriOf(boundApp())).toBe('/counter')
  })

  it('opens and closes the Session page as a pushed entry', () => {
    const bound = boundApp()
    expect(bound.press('OpenSessionSettings')).toBe(true)
    expect(uriOf(bound)).toBe('/counter/session')
    expect(bound.press('OpenSessionSettings')).toBe(false)
    expect(bound.press('CloseSessionSettings')).toBe(true)
    expect(uriOf(bound)).toBe('/counter')
  })

  it('goes back one entry on Escape and leaves the root alone', () => {
    const bound = boundApp()
    bound.press('OpenSessionSettings')
    expect(bound.pressKey(keyInput('Escape'))).toBe(true)
    expect(uriOf(bound)).toBe('/counter')
    expect(bound.pressKey(keyInput('Escape'))).toBe(false)
  })

  it('opens a menu URI and settles its highlight against the Catalog', () => {
    const bound = boundApp()
    expect(bound.openUri('/counter/menu?q=re', Link())).toBe(true)
    expect(uriOf(bound)).toBe('/counter/menu?q=re')
    const highlighted = Option.map(bound.menu(), menu =>
      menu.rows.filter(row => row.isHighlighted).map(row => row.entry.tag),
    )
    expect(highlighted).toEqual(Option.some(['Reset']))
  })

  it('prints the menu above the Session page and returns to it on Back', () => {
    const bound = boundApp()
    bound.press('OpenSessionSettings')
    bound.openMenu()
    bound.typeInMenu('in')
    expect(uriOf(bound)).toBe('/counter/session/menu?q=in')
    bound.navigateBack('/counter/session')
    expect(uriOf(bound)).toBe('/counter/session')
    expect(Option.isNone(bound.menu())).toBe(true)
  })

  it('lands an Action chosen from the menu on the entry beneath it', () => {
    const bound = boundApp()
    bound.openMenu()
    expect(bound.chooseFromMenu('OpenSessionSettings')).toBe(true)
    expect(uriOf(bound)).toBe('/counter/session')
  })

  it('keeps an unknown path and paints it as not found', () => {
    const bound = boundApp()
    bound.openUri('/counter/nope', Link())
    expect(uriOf(bound)).toBe('/counter/nope')
    expect(bound.viewAt('/counter/nope')).toEqual(
      Option.some(
        Declaration.screenView(
          notFoundScreen(Declaration.NotFound({ segments: ['nope'] })),
        ),
      ),
    )
  })

  it('paints the root with the Program screen, Session with its page, and the menu as a menu', () => {
    const bound = boundApp()
    bound.press('Increment')
    bound.openUri('/counter/session/menu', Link())
    const tagAt = (key: string) =>
      Option.map(bound.viewAt(key), view => view._tag)
    expect(bound.viewAt('/counter')).toEqual(
      Option.some(Declaration.screenView(Text('1'))),
    )
    expect(tagAt('/counter/session')).toEqual(Option.some('Screen'))
    expect(tagAt('/counter/session/menu')).toEqual(Option.some('Menu'))
    expect(tagAt('/counter/elsewhere')).toEqual(Option.none())
  })

  it('ignores a launch while mirrored and adopts it once navigation is local', () => {
    const bound = boundApp()
    bound.openUri('/counter/session', Launch())
    expect(uriOf(bound)).toBe('/counter')
    bound.press('KeepNavigationLocal')
    bound.openUri('/counter/session', Launch())
    expect(uriOf(bound)).toBe('/counter/session')
  })

  it('classifies carrier facts and page moves as Navigation and mode changes as Domain', () => {
    const categoryOf = (message: AppMessage) =>
      App.synchronization?.messageCategory(message)
    expect(categoryOf(OpenedUri({ uri: '/counter', via: Link() }))).toBe(
      'Navigation',
    )
    expect(categoryOf(NavigatedBack({ uri: '/counter' }))).toBe('Navigation')
    expect(categoryOf(Session.OpenSessionSettings())).toBe('Navigation')
    expect(categoryOf(ActionMenu.OpenedActionMenu())).toBe('Navigation')
    expect(categoryOf(Session.KeepNavigationLocal())).toBe('Domain')
    expect(categoryOf(Increment())).toBe('Domain')
  })
})

// SYNC

const CountRow = S.Struct({
  id: S.String,
  value: S.Number,
  asOf: S.String,
  at: S.Number,
})

const [initialApp] = App.init()

const AppDestination = S.Union([
  Counter,
  Session.SessionSettings,
  Declaration.NotFound,
  ActionMenu.ActionMenu,
])

const AppModelSchema = S.Struct({
  count: S.Number,
  session: Session.SessionState,
  navigation: NavigationStack(AppDestination),
})

const AppSnapshot = CountRow.pipe(
  S.decodeTo(
    AppModelSchema,
    SchemaTransformation.transform({
      decode: (row): typeof AppModelSchema.Encoded => ({
        count: row.value,
        session: initialApp.session,
        navigation: stackAtRoot<typeof AppDestination.Type>(Counter()),
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

const settleAttempts = 200

const eventually = async <A>(read: () => A, expected: A): Promise<void> => {
  for (
    let attempt = 0;
    attempt < settleAttempts && !Equal.equals(read(), expected);
    attempt += 1
  ) {
    await Effect.runPromise(Effect.sleep(Duration.millis(1)))
  }
  expect(read()).toEqual(expected)
}

const whenReady = (
  handle: Readonly<{
    readModel: () => SyncedModel
    subscribe: (listener: () => void) => () => void
  }>,
): Promise<void> =>
  new Promise(resolve => {
    const check = (): void => {
      if (handle.readModel()._tag === 'Ready') {
        stop()
        resolve()
      }
    }
    const stop = handle.subscribe(check)
    check()
  })

describe('a synced App', () => {
  it('has no plan and refuses carrier facts until Ready', () => {
    const handle = handleOf(Synced)
    const bound = bind(Synced, handle)
    expect(bound.navigation()).toEqual(Option.none())
    expect(bound.openUri('/counter/session', Link())).toBe(false)
    handle.send(Synced.SnapshotReceived({ model: initialApp }))
    expect(Option.map(bound.navigation(), plan => plan.uri)).toEqual(
      Option.some('/counter'),
    )
    expect(bound.openUri('/counter/session', Link())).toBe(true)
    expect(Option.map(bound.navigation(), plan => plan.uri)).toEqual(
      Option.some('/counter/session'),
    )
  })

  it('mirrors a carrier move on every Processor, then keeps moves local', async () => {
    const store = makeMemoryStore()
    const laptop = startHandle({
      program: Synced,
      sync: Memory({ processor: 'react-laptop', store }),
    })
    const phone = startHandle({
      program: Synced,
      sync: Memory({ processor: 'expo-phone', store }),
    })
    try {
      await whenReady(laptop)
      await whenReady(phone)
      const laptopBound = bind(Synced, laptop)
      const phoneBound = bind(Synced, phone)
      const uriOn = (bound: typeof laptopBound) => () =>
        Option.map(bound.navigation(), plan => plan.uri)

      laptopBound.openUri('/counter/session', Link())
      await eventually(uriOn(phoneBound), Option.some('/counter/session'))

      laptopBound.press('KeepNavigationLocal')
      await eventually(
        () =>
          phoneBound.entries().find(entry => entry.tag === 'MirrorNavigation')
            ?.availability._tag,
        'Enabled',
      )
      laptopBound.navigateBack('/counter')
      laptopBound.openUri('/counter/menu', Link())
      await eventually(uriOn(laptopBound), Option.some('/counter/menu'))
      await Effect.runPromise(Effect.sleep(Duration.millis(20)))
      expect(uriOn(phoneBound)()).toEqual(Option.some('/counter/session'))
    } finally {
      await laptop.stop()
      await phone.stop()
    }
  })
})
