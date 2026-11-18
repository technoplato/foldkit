import { Array, Option } from 'effect'
import { Navigation } from 'foldkit'
import { describe, expect, it, vi } from 'vitest'

import { entryOfNavigatorKey, keyedRoutesOf, steadyStack } from './stack.js'

vi.mock('react-native', async () => (await import('../test/native.js')).native)
vi.mock('@foldkit/react/interaction', () => ({}))

type Routes = Array.NonEmptyReadonlyArray<Navigation.KeyedRoute>

type Plan = Navigation.CarrierPlan<string>

const entry = (key: string, identity: string = key) => ({
  key,
  identity,
  uri: key,
  destination: key,
  maybeStyle: Option.none(),
  maybeTitle: Option.none(),
})

const planOf = (
  ...entries: Array.NonEmptyReadonlyArray<ReturnType<typeof entry>>
): Plan => ({
  entries,
  uri: Array.lastNonEmpty(entries).uri,
  history: 'Record',
})

const playerAt = (place: string) =>
  planOf(
    entry('/books'),
    entry('/books/the-lantern-keeper'),
    entry(
      `/books/the-lantern-keeper/listen/${place}`,
      '/books/the-lantern-keeper/listen/0s',
    ),
  )

const navigator = (start: Routes) => {
  const held: { routes: Routes; resets: number } = { routes: start, resets: 0 }
  const stack: Navigation.KeyedStack = {
    routes: () => held.routes,
    reset: next => {
      held.routes = next
      held.resets += 1
    },
    subscribe: () => () => {},
  }
  return { held, stack }
}

const planRoutes = (plan: Plan): Routes =>
  Array.map(plan.entries, each => ({ key: each.key, uri: each.uri }))

const keysOf = (routes: Routes): ReadonlyArray<string> =>
  Array.map(routes, route => route.key)

describe('a page whose address moves while it stays the same page', () => {
  it('gives a navigator one route per entry, under the page it is, not the address it has', () => {
    expect(keysOf(keyedRoutesOf(playerAt('12s')))).toEqual([
      '/books',
      '/books/the-lantern-keeper',
      '/books/the-lantern-keeper/listen/0s',
    ])
  })

  it('leaves a phone’s navigator alone while only the address moves, and still reads as the plan', () => {
    const shown = { plan: playerAt('1s') }
    const { held, stack } = navigator(keyedRoutesOf(playerAt('1s')))
    const steady = steadyStack(stack, () => Option.some(shown.plan), {
      isAddressShown: false,
    })
    shown.plan = playerAt('2s')
    steady.reset(planRoutes(shown.plan))
    shown.plan = playerAt('3s')
    steady.reset(planRoutes(shown.plan))
    expect(held.resets).toBe(0)
    expect(keysOf(steady.routes())).toEqual(keysOf(planRoutes(shown.plan)))
    expect(Array.lastNonEmpty(steady.routes()).uri).toBe(
      '/books/the-lantern-keeper/listen/3s',
    )
  })

  it('writes the moving address where a navigator shows one, under the same key', () => {
    const shown = { plan: playerAt('1s') }
    const { held, stack } = navigator(keyedRoutesOf(playerAt('1s')))
    const steady = steadyStack(stack, () => Option.some(shown.plan), {
      isAddressShown: true,
    })
    shown.plan = playerAt('2s')
    steady.reset(planRoutes(shown.plan))
    expect(held.resets).toBe(1)
    expect(Array.lastNonEmpty(held.routes)).toEqual({
      key: '/books/the-lantern-keeper/listen/0s',
      uri: '/books/the-lantern-keeper/listen/2s',
    })
  })

  it('resets the navigator when the pages themselves change', () => {
    const shown = { plan: playerAt('1s') }
    const { held, stack } = navigator(keyedRoutesOf(playerAt('1s')))
    const steady = steadyStack(stack, () => Option.some(shown.plan), {
      isAddressShown: false,
    })
    shown.plan = planOf(entry('/books'), entry('/books/the-lantern-keeper'))
    steady.reset(planRoutes(shown.plan))
    expect(held.resets).toBe(1)
    expect(keysOf(held.routes)).toEqual(['/books', '/books/the-lantern-keeper'])
  })

  it('reads a page a gesture took away as gone, so the Program hears a move back', () => {
    const shown = { plan: playerAt('9s') }
    const { held, stack } = navigator(keyedRoutesOf(playerAt('9s')))
    const steady = steadyStack(stack, () => Option.some(shown.plan), {
      isAddressShown: false,
    })
    held.routes = [
      { key: '/books', uri: '/books' },
      { key: '/books/the-lantern-keeper', uri: '/books/the-lantern-keeper' },
    ]
    expect(keysOf(steady.routes())).toEqual([
      '/books',
      '/books/the-lantern-keeper',
    ])
  })

  it('finds the entry a navigator route shows, whatever its address is now', () => {
    const plan = playerAt('41s')
    expect(
      Option.map(
        entryOfNavigatorKey(plan, '/books/the-lantern-keeper/listen/0s#2'),
        found => found.key,
      ),
    ).toEqual(Option.some('/books/the-lantern-keeper/listen/41s'))
    expect(entryOfNavigatorKey(plan, '/books/profile')).toEqual(Option.none())
  })
})
