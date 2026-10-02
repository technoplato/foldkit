import { Array, Option, Schema as S, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Route from '../route/parser.js'
import { ts } from '../schema/index.js'
import {
  Counter,
  Destination,
  type Model,
  SessionSettings,
  counterRoute,
  isSessionSettings,
  menuEntry,
  menuRoute,
  navigation,
  notFoundRoute,
  sessionEntry,
  sessionRoute,
} from '../test/apps/navigationCounter.js'
import * as Declaration from './declaration.js'
import { Push, presented, stackAtRoot, stackWithEntries } from './structure.js'
import {
  canonicalUri,
  defaultUri,
  ownsUri,
  parseStack,
  pathOf,
  printStack,
  splitUri,
} from './uri.js'

const print = (uri: string): string =>
  Option.getOrThrow(printStack(navigation, parseStack(navigation, uri)))

describe('splitUri', () => {
  it('decodes each segment and keeps the search raw', () => {
    expect(splitUri('/counters/counter/a%20b?q=re')).toEqual({
      segments: ['counters', 'counter', 'a b'],
      search: 'q=re',
    })
  })

  it('keeps a malformed escape as it was written', () => {
    expect(splitUri('/counter/%E0%A4%A').segments).toEqual([
      'counter',
      '%E0%A4%A',
    ])
  })

  it('drops the fragment, which scrolls a page and names none', () => {
    expect(splitUri('/counter/menu?menu.q=re#row')).toEqual({
      segments: ['counter', 'menu'],
      search: 'menu.q=re',
    })
  })

  it('drops empty segments from repeated and trailing slashes', () => {
    expect(splitUri('//counter//session/').segments).toEqual([
      'counter',
      'session',
    ])
  })
})

describe('pathOf', () => {
  it('drops the query, which is configuration, not identity', () => {
    expect(pathOf('/counter/menu?menu.q=re')).toBe('/counter/menu')
  })
})

describe('parseStack and printStack', () => {
  it.each([
    ['/counter', '/counter'],
    ['/counter/session', '/counter/session'],
    ['/counter/menu', '/counter/menu'],
    ['/counter/menu?menu.q=re', '/counter/menu?menu.q=re'],
    ['/counter/session/menu?menu.q=fo', '/counter/session/menu?menu.q=fo'],
    ['/counter/bogus', '/counter/bogus'],
    ['/counter/bogus/deeper', '/counter/bogus/deeper'],
    ['/elsewhere', '/elsewhere'],
    ['/', '/counter'],
    ['', '/counter'],
    ['/counter/', '/counter'],
    ['/counter?utm_source=mail', '/counter'],
    ['/counter/menu?menu.q=re&utm_source=mail', '/counter/menu?menu.q=re'],
    ['/counter/menu?menu.q=', '/counter/menu'],
    ['/counter/session/session', '/counter/session/session'],
    ['/counter/menu/session', '/counter/menu/session'],
    ['/counter/menu?menu.q=a%20b', '/counter/menu?menu.q=a+b'],
    ['/counter/a%2Fb', '/counter/a%2Fb'],
    ['/counter/nope/menu?menu.q=re', '/counter/nope/menu?menu.q=re'],
    ['/elsewhere/menu', '/elsewhere/menu'],
    ['/counter/session#top', '/counter/session'],
    ['/counter/menu?menu.q=re#row', '/counter/menu?menu.q=re'],
  ])('prints %s as %s and the printed URI is a fixed point', (uri, printed) => {
    expect(print(uri)).toBe(printed)
    expect(print(printed)).toBe(printed)
  })

  it('parses a deep URI into the whole stack, root first', () => {
    expect(parseStack(navigation, '/counter/session/menu?menu.q=fo')).toEqual(
      stackWithEntries<Destination>(Counter(), [
        presented(SessionSettings(), Push()),
        menuEntry('fo'),
      ]),
    )
  })

  it('backtracks before falling back, so NotFound holds only the unmatched tail', () => {
    expect(parseStack(navigation, '/counter/session/nope')).toEqual(
      stackWithEntries<Destination>(Counter(), [
        sessionEntry,
        presented(Declaration.NotFound({ segments: ['nope'] }), Push()),
      ]),
    )
  })

  it('keeps the attempted path of a URI outside the slug as a NotFound root', () => {
    expect(parseStack(navigation, '/elsewhere/page')).toEqual(
      stackAtRoot<Destination>(
        Declaration.NotFound({ segments: ['elsewhere', 'page'] }),
      ),
    )
  })

  it('keeps a page presented above NotFound as its own entry', () => {
    expect(parseStack(navigation, '/counter/nope/menu?menu.q=re')).toEqual(
      stackWithEntries<Destination>(Counter(), [
        presented(Declaration.NotFound({ segments: ['nope'] }), Push()),
        menuEntry('re'),
      ]),
    )
  })

  it('reads an absurdly long URI as one NotFound, quickly', () => {
    const longUri = `/counter/${Array.join(Array.replicate('menu/x', 600), '/')}`
    const startedAt = performance.now()
    const stack = parseStack(navigation, longUri)
    expect(performance.now() - startedAt).toBeLessThan(50)
    expect(stack.presented._tag).toBe('NothingPresented')
    expect(print(longUri)).toBe(longUri)
  })

  it('refuses a menu above a menu', () => {
    expect(parseStack(navigation, '/counter/menu/menu')).toEqual(
      stackWithEntries<Destination>(Counter(), [
        menuEntry(''),
        presented(Declaration.NotFound({ segments: ['menu'] }), Push()),
      ]),
    )
  })

  it('prints nothing for an entry that adds no segment of its own', () => {
    const silentSession = Declaration.make<Model, Destination>({
      slug: 'counter',
      Destination,
      root: Counter(),
      routes: {
        Counter: counterRoute,
        SessionSettings: Declaration.pushRoute(
          Route.caseOf(
            Route.here,
            Declaration.tagCase<Destination, SessionSettings>(
              isSessionSettings,
              SessionSettings,
            ),
          ),
        ),
        ActionMenu: menuRoute,
        NotFound: notFoundRoute,
      },
    })
    expect(
      printStack(
        silentSession,
        stackWithEntries<Destination>(Counter(), [sessionEntry]),
      ),
    ).toEqual(Option.none())
  })
})

describe('query keys', () => {
  const SearchPage = ts('SearchPage', { term: S.String })
  type Wide = Destination | typeof SearchPage.Type
  const searchRoute = Declaration.pushRoute(
    Route.caseOf<Wide, { q: string }>(
      pipe(Route.literal('search'), Route.query(S.Struct({ q: S.String }))),
      {
        embed: ({ q }) => SearchPage({ term: q }),
        extract: destination =>
          S.is(SearchPage)(destination)
            ? Option.some({ q: destination.term })
            : Option.none(),
      },
    ),
  )
  const narrow = (destination: Wide): Option.Option<Destination> =>
    S.is(Destination)(destination) ? Option.some(destination) : Option.none()
  const withSearch = Declaration.make<Model, Wide>({
    slug: 'counter',
    Destination: S.Union([Destination, SearchPage]),
    root: Counter(),
    routes: {
      Counter: Declaration.liftRoute(counterRoute, narrow),
      SearchPage: searchRoute,
      SessionSettings: Declaration.liftRoute(sessionRoute, narrow),
      ActionMenu: Declaration.liftRoute(menuRoute, narrow),
      NotFound: Declaration.liftRoute(notFoundRoute, narrow),
    },
  })

  it('prefixes each entry key with its own path, so two `q`s keep their values', () => {
    const stack = stackWithEntries<Wide>(Counter(), [
      presented(SearchPage({ term: 'cats' }), Push()),
      menuEntry('re'),
    ])
    const printed = Option.getOrThrow(printStack(withSearch, stack))
    expect(printed).toBe('/counter/search/menu?search.q=cats&menu.q=re')
    expect(parseStack(withSearch, printed)).toEqual(stack)
  })

  it('keeps an empty menu from picking up the page beneath', () => {
    const stack = stackWithEntries<Wide>(Counter(), [
      presented(SearchPage({ term: 'cats' }), Push()),
      menuEntry(''),
    ])
    const printed = Option.getOrThrow(printStack(withSearch, stack))
    expect(printed).toBe('/counter/search/menu?search.q=cats')
    expect(parseStack(withSearch, printed)).toEqual(stack)
  })

  it('reads a bare key as the root key, so an old `?q=` no longer filters the menu', () => {
    expect(print('/counter/menu?q=re')).toBe('/counter/menu')
  })
})

describe('ownsUri', () => {
  it.each([
    ['/counter', true],
    ['/counter/session?x=1', true],
    ['/about', false],
    ['//cdn.example/counter', false],
    ['https://counter.example/counter', false],
    ['counter', false],
  ])('owns %s: %s', (uri, isOwn) => {
    expect(ownsUri(navigation, uri)).toBe(isOwn)
  })
})

describe('canonicalUri and defaultUri', () => {
  it('canonicalizes by parsing and printing', () => {
    expect(
      canonicalUri(navigation, '/counter/menu?menu.q=re&utm_source=mail'),
    ).toEqual(Option.some('/counter/menu?menu.q=re'))
  })

  it('prints the root stack as the default', () => {
    expect(defaultUri(navigation)).toEqual(Option.some('/counter'))
  })

  it('needs no slug: the root then prints at `/`', () => {
    const slugless = Declaration.make<Model, Destination>({
      Destination,
      root: Counter(),
      routes: {
        Counter: counterRoute,
        SessionSettings: sessionRoute,
        ActionMenu: menuRoute,
        NotFound: notFoundRoute,
      },
    })
    expect(defaultUri(slugless)).toEqual(Option.some('/'))
    expect(canonicalUri(slugless, '/session')).toEqual(Option.some('/session'))
  })
})

describe('make', () => {
  it('rejects routes without a Root route that prints the root', () => {
    expect(() =>
      Declaration.make<Model, Destination>({
        slug: 'counter',
        Destination,
        root: Counter(),
        routes: {
          Counter: sessionRoute,
          SessionSettings: sessionRoute,
          ActionMenu: menuRoute,
          NotFound: notFoundRoute,
        },
      }),
    ).toThrow(Declaration.NavigationDeclarationError)
  })

  it('does not compile a Destination without a route', () => {
    const declareWithoutRoutes = () =>
      Declaration.make<Model, Destination>({
        slug: 'counter',
        Destination,
        root: Counter(),
        // @ts-expect-error SessionSettings, ActionMenu, and NotFound have no route
        routes: { Counter: counterRoute },
      })
    expect(declareWithoutRoutes).toBeInstanceOf(Function)
  })

  it('does not compile a hand-written declaration', () => {
    const handWritten = () => {
      // @ts-expect-error only screens, make, and the combinators build one
      const declaration: Declaration.ProgramNavigation<Model, Destination> = {
        Destination,
        root: Counter(),
        routes: [counterRoute],
      }
      return declaration
    }
    expect(handWritten).toBeInstanceOf(Function)
  })
})

describe('screens', () => {
  const Search = ts('Search', { q: S.String })
  const searchScreen = Declaration.pushScreen(
    Search,
    pipe(Route.literal('search'), Route.query(S.Struct({ q: S.String }))),
  )
  const shop = Declaration.screens({
    slug: 'shop',
    root: Declaration.rootScreen(Counter, Route.here),
    screens: [searchScreen],
  })

  it('derives the Destinations and routes from the screens', () => {
    const stack = stackWithEntries<Counter | typeof Search.Type>(Counter(), [
      presented(Search({ q: 'cats' }), Push()),
    ])
    expect(printStack(shop, stack)).toEqual(
      Option.some('/shop/search?search.q=cats'),
    )
    expect(parseStack(shop, '/shop/search?search.q=cats')).toEqual(stack)
  })

  it('does not compile a route that drops a screen field', () => {
    const dropsQuery = () =>
      // @ts-expect-error the route parses no `q`, which Search needs
      Declaration.pushScreen(Search, Route.literal('search'))
    expect(dropsQuery).toBeInstanceOf(Function)
  })
})
