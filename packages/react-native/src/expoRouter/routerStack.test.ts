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
  type RootReset,
  type RouterRefLike,
  type RouterRoute,
  expoRouterStack,
  routerRouteOf,
  uriOfRoute,
} from './routerStack.js'

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
      id: 'expo-router-counter',
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

type LayoutRoute = Readonly<{ key: string; name: string; params?: object }>

type FakeContainer = Readonly<{
  ref: RouterRefLike
  slotKey: () => string
  lastReset: () => Option.Option<RootReset>
  layoutKeys: () => ReadonlyArray<string>
  layoutUris: () => ReadonlyArray<string>
  swipeBack: () => void
}>

const slotKey = '__root-7f3a'

const makeContainer = (
  initialLayout: Array.NonEmptyReadonlyArray<LayoutRoute>,
): FakeContainer => {
  let currentSlotKey = slotKey
  let layout: ReadonlyArray<LayoutRoute> = initialLayout
  let lastReset: Option.Option<RootReset> = Option.none()
  const listeners = new Set<() => void>()
  const emitSoon = (): void => {
    setTimeout(() => listeners.forEach(listener => listener()), 0)
  }
  return {
    ref: {
      getRootState: () => ({
        key: 'root-stack-1',
        stale: false,
        routes: [
          {
            key: currentSlotKey,
            name: '__root',
            state: { key: 'layout-stack-1', stale: false, routes: layout },
          },
        ],
      }),
      resetRoot: (state: RootReset) => {
        lastReset = Option.some(state)
        const maybeSlot = Array.head(state.routes)
        if (Option.isSome(maybeSlot)) {
          currentSlotKey = maybeSlot.value.key
          layout = maybeSlot.value.state.routes
        }
        emitSoon()
      },
      addListener: (_type, listener) => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    slotKey: () => currentSlotKey,
    lastReset: () => lastReset,
    layoutKeys: () => Array.map(layout, route => route.key),
    layoutUris: () =>
      Array.getSomes(
        Array.map(layout, route =>
          uriOfRoute({ name: route.name, params: route.params }),
        ),
      ),
    swipeBack: () => {
      layout = layout.length > 1 ? Array.dropRight(layout, 1) : layout
      emitSoon()
    },
  }
}

const indexLayout: Array.NonEmptyReadonlyArray<LayoutRoute> = [
  { key: 'index-1', name: 'index', params: {} },
]

const deepLinkLayout: Array.NonEmptyReadonlyArray<LayoutRoute> = [
  {
    key: '[...path]-9',
    name: '[...path]',
    params: { path: ['counter', 'session'] },
  },
]

const runOn = (bound: ReturnType<typeof bindApp>, container: FakeContainer) => {
  const stack = expoRouterStack(container.ref, [
    { key: '/counter', uri: '/counter' },
  ])
  return Navigation.runCarrier(bound, Navigation.keyedStackDriver(stack), {
    launchUri: Option.some(Array.lastNonEmpty(stack.routes()).uri),
    reportTimeoutMs: 5,
  })
}

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

describe('routerRouteOf and uriOfRoute', () => {
  it('writes the segments as the catch-all path and the query beside them', () => {
    const route: RouterRoute = routerRouteOf({
      key: '/counter/menu',
      uri: '/counter/menu?menu.q=re',
    })
    expect(route).toEqual({
      key: '/counter/menu',
      name: '[...path]',
      params: { 'menu.q': 're', path: ['counter', 'menu'] },
    })
    expect(uriOfRoute(route)).toEqual(Option.some('/counter/menu?menu.q=re'))
  })

  it('reads the index route as the bare root and ignores other routes', () => {
    expect(uriOfRoute({ name: 'index', params: {} })).toEqual(Option.some('/'))
    expect(uriOfRoute({ name: '+not-found' })).toEqual(Option.none())
  })
})

describe('expoRouterStack', () => {
  it('replaces the index route with the plan and keeps the root slot key', async () => {
    const bound = bindApp()
    const container = makeContainer(indexLayout)
    runOn(bound, container)
    await settle()
    expect(container.layoutKeys()).toEqual(['/counter'])
    expect(container.slotKey()).toBe(slotKey)
    bound.press('OpenSessionSettings')
    await settle()
    expect(container.layoutUris()).toEqual(['/counter', '/counter/session'])
    expect(container.slotKey()).toBe(slotKey)
  })

  it('keeps the root and layout state keys, so web history pushes', async () => {
    const bound = bindApp()
    const container = makeContainer(indexLayout)
    runOn(bound, container)
    await settle()
    expect(container.lastReset()).toEqual(
      Option.some(
        expect.objectContaining({
          key: 'root-stack-1',
          stale: false,
          routes: [
            expect.objectContaining({
              key: slotKey,
              state: expect.objectContaining({
                key: 'layout-stack-1',
                stale: false,
              }),
            }),
          ],
        }),
      ),
    )
  })

  it('launches at the URL Expo Router opened with when navigation is local', async () => {
    const bound = bindApp()
    bound.press('KeepNavigationLocal')
    const container = makeContainer(deepLinkLayout)
    runOn(bound, container)
    await settle(5)
    expect(uriOf(bound)).toBe('/counter/session')
    expect(container.layoutKeys()).toEqual(['/counter', '/counter/session'])
  })

  it('joins the shared screen instead while navigation is mirrored', async () => {
    const bound = bindApp()
    const container = makeContainer(deepLinkLayout)
    runOn(bound, container)
    await settle(5)
    expect(uriOf(bound)).toBe('/counter')
    expect(container.layoutKeys()).toEqual(['/counter'])
  })

  it('reports a swipe back as going back to the entry beneath', async () => {
    const bound = bindApp()
    const container = makeContainer(indexLayout)
    runOn(bound, container)
    bound.press('OpenSessionSettings')
    await settle()
    container.swipeBack()
    await settle()
    expect(uriOf(bound)).toBe('/counter')
  })

  it('reads a menu it wrote as the URI it wrote', async () => {
    const bound = bindApp()
    const container = makeContainer(indexLayout)
    runOn(bound, container)
    bound.openUri('/counter/menu?menu.q=in', Navigation.Link())
    await settle()
    expect(container.layoutUris()).toEqual([
      '/counter',
      '/counter/menu?menu.q=in',
    ])
    expect(uriOf(bound)).toBe('/counter/menu?menu.q=in')
  })
})
