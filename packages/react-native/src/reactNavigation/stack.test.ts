import { Array, Match as M, Option, Schema as S } from 'effect'
import {
  ActionMenu,
  Catalog,
  Interaction,
  Navigation,
  Program,
  Route,
  Session,
} from 'foldkit'
import { ts } from 'foldkit/schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  type EntryState,
  type NavigationRefLike,
  entryStateOf,
  presentationOf,
  reactNavigationStack,
} from './stack.js'

// PROGRAM

const Model = S.Struct({ count: S.Number })
type Model = typeof Model.Type

const Increment = Catalog.action('Increment', {
  what: 'Increments the count by one',
  why: 'The person wants a higher count',
  meta: { label: '+', keys: ['+'] },
})
const catalog = Catalog.make([Increment])
type CounterMessage = typeof catalog.Message.Type

const Counter = ts('Counter')
type Counter = typeof Counter.Type

const App = ActionMenu.compose({
  of: Session.compose({
    of: Program.make({
      id: 'native-routed-counter',
      version: 1,
      Model,
      Message: catalog.Message,
      init: () => [{ count: 0 }, []],
      update: (model: Model, message: CounterMessage) =>
        M.value(message).pipe(
          M.withReturnType<readonly [Model, ReadonlyArray<never>]>(),
          M.tagsExhaustive({
            Increment: () => [{ count: model.count + 1 }, []],
          }),
        ),
      catalog,
      navigation: Navigation.make<Model, Counter>({
        slug: Navigation.Slug.make('counter'),
        Destination: Counter,
        root: Counter(),
        routes: [
          Navigation.rootRoute(
            Route.caseOf(
              Route.here,
              Navigation.tagCase<Counter, Counter>(S.is(Counter), Counter),
            ),
          ),
        ],
      }),
    }),
  }),
})
type AppModel = typeof App.Model.Type
type AppMessage = typeof App.Message.Type

const bindApp = () => {
  const listeners = new Set<() => void>()
  let model: AppModel = App.init()[0]
  return Interaction.bind<AppModel, AppMessage>(App, {
    readModel: () => model,
    subscribe: listener => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    send: message => {
      model = App.update(model, message)[0]
      listeners.forEach(listener => listener())
    },
    stop: () => Promise.resolve(),
  })
}

const uriOf = (bound: ReturnType<typeof bindApp>): string =>
  Option.match(bound.navigation(), {
    onNone: () => 'no plan',
    onSome: plan => plan.uri,
  })

// CONTAINER

type FakeContainer = Readonly<{
  ref: NavigationRefLike
  keys: () => ReadonlyArray<string>
  swipeBack: () => void
}>

const makeContainer = (initial: EntryState): FakeContainer => {
  let state = initial
  const listeners = new Set<() => void>()
  const emitSoon = (): void => {
    setTimeout(() => listeners.forEach(listener => listener()), 0)
  }
  return {
    ref: {
      getRootState: () => state,
      resetRoot: next => {
        state = next
        emitSoon()
      },
      addListener: (_type, listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    keys: () => Array.map(state.routes, route => route.key),
    swipeBack: () => {
      state = Array.match(Array.initNonEmpty(state.routes), {
        onEmpty: () => state,
        onNonEmpty: routes => ({
          index: routes.length - 1,
          routes: Array.copy(routes),
        }),
      })
      emitSoon()
    },
  }
}

const rootRoutes: Array.NonEmptyReadonlyArray<Navigation.KeyedRoute> = [
  { key: '/counter', uri: '/counter' },
]

const runOn = (bound: ReturnType<typeof bindApp>, container: FakeContainer) =>
  Navigation.runCarrier(
    bound,
    Navigation.keyedStackDriver(
      reactNavigationStack(container.ref, rootRoutes),
    ),
    { reportTimeoutMs: 5 },
  )

const settle = async (ms = 0): Promise<void> => {
  await vi.advanceTimersByTimeAsync(ms)
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

// TESTS

describe('entryStateOf', () => {
  it('writes one keyed route per entry, the top last', () => {
    expect(
      entryStateOf([
        { key: '/counter', uri: '/counter' },
        { key: '/counter/menu', uri: '/counter/menu?menu.q=re' },
      ]),
    ).toEqual({
      index: 1,
      routes: [
        { key: '/counter', name: 'FoldkitEntry', params: { uri: '/counter' } },
        {
          key: '/counter/menu',
          name: 'FoldkitEntry',
          params: { uri: '/counter/menu?menu.q=re' },
        },
      ],
    })
  })
})

describe('presentationOf', () => {
  it.each<[string, Option.Option<Navigation.PresentationStyle>, string]>([
    ['the root', Option.none(), 'card'],
    ['a pushed page', Option.some(Navigation.Push()), 'card'],
    ['a sheet', Option.some(Navigation.Sheet()), 'formSheet'],
    ['a dialog', Option.some(Navigation.Dialog()), 'transparentModal'],
    [
      'a full screen cover',
      Option.some(Navigation.FullScreenCover()),
      'fullScreenModal',
    ],
  ])('presents %s as %s', (_label, maybeStyle, expected) => {
    expect(presentationOf(maybeStyle)).toBe(expected)
  })
})

describe('reactNavigationStack', () => {
  it('resets the container to each plan and keeps the keys', async () => {
    const bound = bindApp()
    const container = makeContainer(entryStateOf(rootRoutes))
    runOn(bound, container)
    bound.press('OpenSessionSettings')
    await settle()
    expect(container.keys()).toEqual(['/counter', '/counter/session'])
    bound.openMenu()
    await settle()
    expect(container.keys()).toEqual([
      '/counter',
      '/counter/session',
      '/counter/session/menu',
    ])
  })

  it('reports a swipe back as going back to the entry beneath', async () => {
    const bound = bindApp()
    const container = makeContainer(entryStateOf(rootRoutes))
    runOn(bound, container)
    bound.press('OpenSessionSettings')
    await settle()
    container.swipeBack()
    await settle()
    expect(uriOf(bound)).toBe('/counter')
    expect(container.keys()).toEqual(['/counter'])
  })

  it('opens a deep link at launch once the Program allows it', async () => {
    const bound = bindApp()
    bound.press('KeepNavigationLocal')
    const container = makeContainer(entryStateOf(rootRoutes))
    Navigation.runCarrier(
      bound,
      Navigation.keyedStackDriver(
        reactNavigationStack(container.ref, rootRoutes),
      ),
      { launchUri: Option.some('/counter/session'), reportTimeoutMs: 5 },
    )
    await settle()
    expect(uriOf(bound)).toBe('/counter/session')
    expect(container.keys()).toEqual(['/counter', '/counter/session'])
  })
})
