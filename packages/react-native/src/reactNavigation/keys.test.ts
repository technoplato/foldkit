import { Array, Option } from 'effect'
import { Navigation } from 'foldkit'
import { describe, expect, it, vi } from 'vitest'

import { uriOfNativeLink } from './deepLinks.js'
import {
  navigatorKeyOf,
  planKeyOf,
  presentationOf,
  renewedStack,
} from './stack.js'

vi.mock('react-native', async () => (await import('../test/native.js')).native)
vi.mock('@foldkit/react/interaction', () => ({}))

type Routes = Array.NonEmptyReadonlyArray<Navigation.KeyedRoute>

const routesOf = (...keys: Array.NonEmptyReadonlyArray<string>): Routes =>
  Array.map(keys, key => ({ key, uri: key }))

/** A navigator that holds whatever routes it was last given. */
const navigator = (start: Routes) => {
  const held: { routes: Routes; resets: Array<Routes> } = {
    routes: start,
    resets: [],
  }
  const stack: Navigation.KeyedStack = {
    routes: () => held.routes,
    reset: next => {
      held.routes = next
      held.resets.push(next)
    },
    subscribe: () => () => {},
  }
  return { held, stack }
}

const keysOf = (routes: Routes): ReadonlyArray<string> =>
  Array.map(routes, route => route.key)

describe('the keys a navigator holds', () => {
  it('spells an entry shown again with a count, and reads it back as the entry', () => {
    expect(navigatorKeyOf('/counter/session', 0)).toBe('/counter/session')
    expect(navigatorKeyOf('/counter/session', 2)).toBe('/counter/session#2')
    expect(planKeyOf('/counter/session#2')).toBe('/counter/session')
    expect(planKeyOf('/counter/session')).toBe('/counter/session')
  })

  it('never hands a navigator a key a gesture took away', () => {
    const { held, stack } = navigator(routesOf('/counter'))
    const renewed = renewedStack(stack)
    renewed.reset(routesOf('/counter', '/counter/session'))
    expect(keysOf(held.routes)).toEqual(['/counter', '/counter/session'])

    held.routes = routesOf('/counter')
    expect(keysOf(renewed.routes())).toEqual(['/counter'])

    renewed.reset(routesOf('/counter', '/counter/session'))
    expect(keysOf(held.routes)).toEqual(['/counter', '/counter/session#1'])
    expect(keysOf(renewed.routes())).toEqual(['/counter', '/counter/session'])
  })

  it('renews a key the Program itself closed, and keeps the key of an entry that stays', () => {
    const { held, stack } = navigator(routesOf('/books'))
    const renewed = renewedStack(stack)
    renewed.reset(routesOf('/books', '/books/a'))
    renewed.reset(routesOf('/books'))
    renewed.reset(routesOf('/books', '/books/a'))
    renewed.reset(routesOf('/books', '/books/a', '/books/a/listen'))
    expect(keysOf(held.routes)).toEqual([
      '/books',
      '/books/a#1',
      '/books/a/listen',
    ])
  })
})

describe('how a phone presents an entry', () => {
  it('presents a drawer as a sheet, since a phone has no room beside the page', () => {
    expect(
      presentationOf(Option.some(Navigation.Drawer({ from: 'Left' }))),
    ).toBe('formSheet')
    expect(presentationOf(Option.some(Navigation.Sheet()))).toBe('formSheet')
    expect(presentationOf(Option.some(Navigation.Dialog()))).toBe(
      'transparentModal',
    )
    expect(presentationOf(Option.none())).toBe('card')
  })
})

describe('the address a link a phone opened names', () => {
  it('reads a link through Expo Go or a development build after its delimiter', () => {
    expect(uriOfNativeLink('exp://127.0.0.1:8081/--/counter/session')).toEqual(
      Option.some('/counter/session'),
    )
    expect(
      uriOfNativeLink('exp://192.168.1.4:8081/--/counter/menu?menu.q=re'),
    ).toEqual(Option.some('/counter/menu?menu.q=re'))
    expect(
      uriOfNativeLink('exp+foldkit-books://expo-development-client/--/books'),
    ).toEqual(Option.some('/books'))
  })

  it('takes a link that only opens the project as naming no address', () => {
    expect(uriOfNativeLink('exp://127.0.0.1:8081')).toEqual(Option.none())
  })

  it("reads an app's own scheme and a web link as the core does", () => {
    expect(uriOfNativeLink('foldkit-counter://counter/session')).toEqual(
      Option.some('/counter/session'),
    )
    expect(
      uriOfNativeLink(
        'https://books.example/books/the-lantern-keeper/listen/12m03.45s',
      ),
    ).toEqual(Option.some('/books/the-lantern-keeper/listen/12m03.45s'))
  })
})
