import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Route from '../route/parser.js'
import {
  Counter,
  type Destination,
  type Model,
  SessionSettings,
  counterRoute,
  isSessionSettings,
  menuEntry,
  menuRoute,
  navigation,
  sessionEntry,
  sessionRoute,
} from '../test/apps/navigationCounter.js'
import * as Declaration from './declaration.js'
import { Push, presented, stackAtRoot, stackWithEntries } from './structure.js'
import {
  canonicalUri,
  defaultUri,
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

  it('drops empty segments from repeated and trailing slashes', () => {
    expect(splitUri('//counter//session/').segments).toEqual([
      'counter',
      'session',
    ])
  })
})

describe('pathOf', () => {
  it('drops the query, which is configuration, not identity', () => {
    expect(pathOf('/counter/menu?q=re')).toBe('/counter/menu')
  })
})

describe('parseStack and printStack', () => {
  it.each([
    ['/counter', '/counter'],
    ['/counter/session', '/counter/session'],
    ['/counter/menu', '/counter/menu'],
    ['/counter/menu?q=re', '/counter/menu?q=re'],
    ['/counter/session/menu?q=fo', '/counter/session/menu?q=fo'],
    ['/counter/bogus', '/counter/bogus'],
    ['/counter/bogus/deeper', '/counter/bogus/deeper'],
    ['/elsewhere', '/elsewhere'],
    ['/', '/counter'],
    ['', '/counter'],
    ['/counter/', '/counter'],
    ['/counter?utm_source=mail', '/counter'],
    ['/counter/menu?q=re&utm_source=mail', '/counter/menu?q=re'],
    ['/counter/menu?q=', '/counter/menu'],
    ['/counter/session/session', '/counter/session/session'],
    ['/counter/menu/session', '/counter/menu/session'],
    ['/counter/menu?q=a%20b', '/counter/menu?q=a+b'],
    ['/counter/a%2Fb', '/counter/a%2Fb'],
  ])('prints %s as %s and the printed URI is a fixed point', (uri, printed) => {
    expect(print(uri)).toBe(printed)
    expect(print(printed)).toBe(printed)
  })

  it('parses a deep URI into the whole stack, root first', () => {
    expect(parseStack(navigation, '/counter/session/menu?q=fo')).toEqual(
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

  it('refuses a menu above a menu', () => {
    expect(parseStack(navigation, '/counter/menu/menu')).toEqual(
      stackWithEntries<Destination>(Counter(), [
        menuEntry(''),
        presented(Declaration.NotFound({ segments: ['menu'] }), Push()),
      ]),
    )
  })

  it('prints nothing for a Destination with no route', () => {
    const counterOnly = Declaration.make<Model, Destination>({
      ...navigation,
      routes: [counterRoute],
    })
    expect(
      printStack(
        counterOnly,
        stackWithEntries<Destination>(Counter(), [sessionEntry]),
      ),
    ).toEqual(Option.none())
  })

  it('prints nothing for an entry that adds no segment of its own', () => {
    const silentSession = Declaration.make<Model, Destination>({
      ...navigation,
      routes: [
        counterRoute,
        Declaration.pushRoute(
          Route.caseOf(
            Route.here,
            Declaration.tagCase<Destination, SessionSettings>(
              isSessionSettings,
              SessionSettings,
            ),
          ),
        ),
      ],
    })
    expect(
      printStack(
        silentSession,
        stackWithEntries<Destination>(Counter(), [sessionEntry]),
      ),
    ).toEqual(Option.none())
  })
})

describe('canonicalUri and defaultUri', () => {
  it('canonicalizes by parsing and printing', () => {
    expect(
      canonicalUri(navigation, '/counter/menu?q=re&utm_source=mail'),
    ).toEqual(Option.some('/counter/menu?q=re'))
  })

  it('prints the root stack as the default', () => {
    expect(defaultUri(navigation)).toEqual(Option.some('/counter'))
  })

  it('needs no slug: the root then prints at `/`', () => {
    const { slug: _slug, ...withoutSlug } = navigation
    const slugless = Declaration.make<Model, Destination>(withoutSlug)
    expect(defaultUri(slugless)).toEqual(Option.some('/'))
    expect(canonicalUri(slugless, '/session')).toEqual(Option.some('/session'))
  })
})

describe('make', () => {
  it('rejects routes without a Root route that prints the root', () => {
    expect(() =>
      Declaration.make<Model, Destination>({
        ...navigation,
        routes: [sessionRoute, menuRoute],
      }),
    ).toThrow(Declaration.NavigationDeclarationError)
  })

  it('accepts a Program that is not URL-addressable', () => {
    const { routes: _routes, ...withoutRoutes } = navigation
    expect(
      Declaration.make<Model, Destination>(withoutRoutes).routes,
    ).toBeUndefined()
  })
})
