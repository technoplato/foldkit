import { Array, Option, Schema as S, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Route from '../route/parser.js'
import { ts } from '../schema/index.js'
import {
  presentScreen,
  pushScreen,
  rootScreen,
  screens,
} from './declaration.js'
import {
  addressesOf,
  pathOfAddress,
  roundTripOf,
  routeTableOf,
} from './routeTable.js'
import { Drawer, Sheet, entriesOf } from './structure.js'
import { parseStack } from './uri.js'

const TitleSlug = S.String.check(
  S.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
).pipe(S.brand('TitleSlug'))

const Shelf = ts('Shelf')
const Profile = ts('Profile')
const Title = ts('Title', { slug: TitleSlug })
const Listen = ts('Listen')
const Contents = ts('Contents')

const isTagged =
  (...tags: ReadonlyArray<string>) =>
  (destination: unknown): boolean =>
    S.is(S.Struct({ _tag: S.String }))(destination) &&
    Array.contains(tags, destination._tag)

const topIs =
  (...tags: ReadonlyArray<string>) =>
  (beneath: ReadonlyArray<unknown>): boolean =>
    Option.exists(Array.last(beneath), isTagged(...tags))

const navigation = screens({
  slug: 'shelf',
  root: rootScreen(Shelf, Route.here, { title: () => 'Shelf' }),
  screens: [
    pushScreen(Profile, Route.literal('profile'), {
      isAllowedAbove: topIs('Shelf'),
    }),
    pushScreen(Title, Route.schemaSegment('slug', TitleSlug), {
      isAllowedAbove: topIs('Shelf'),
    }),
    pushScreen(Listen, Route.literal('listen'), {
      isAllowedAbove: topIs('Title'),
    }),
    presentScreen(
      Contents,
      Route.literal('contents'),
      Drawer({ from: 'Left' }),
      {
        isAllowedAbove: topIs('Title', 'Listen'),
      },
    ),
  ],
})

describe('the routes a Program declares, as a table', () => {
  it('names each route by its Destination, with where it sits and how it presents', () => {
    expect(
      Array.map(routeTableOf(navigation), row => [
        row.name,
        row.placement,
        row.presentation,
      ]),
    ).toEqual([
      ['Shelf', 'Root', 'Push'],
      ['Profile', 'Entry', 'Push'],
      ['Title', 'Entry', 'Push'],
      ['Listen', 'Entry', 'Push'],
      ['Contents', 'Entry', 'Drawer'],
    ])
  })

  it('says each route’s own part of an address', () => {
    const partOf = (name: string) =>
      pipe(
        Array.findFirst(routeTableOf(navigation), row => row.name === name),
        Option.map(row =>
          pathOfAddress(row.segments, { param: name => `:${name}` }),
        ),
      )
    expect(partOf('Shelf')).toEqual(Option.some('/'))
    expect(partOf('Title')).toEqual(Option.some('/:slug'))
    expect(partOf('Listen')).toEqual(Option.some('/listen'))
  })
})

describe('every address a Program can be at', () => {
  it('lists each allowed stack once, root first, and nothing the routes refuse', () => {
    const addresses = addressesOf(navigation)
    expect(
      Array.map(addresses, address =>
        pathOfAddress(address.segments, { param: name => `:${name}` }),
      ),
    ).toEqual([
      '/shelf',
      '/shelf/profile',
      '/shelf/:slug',
      '/shelf/:slug/listen',
      '/shelf/:slug/contents',
      '/shelf/:slug/listen/contents',
    ])
  })

  it('names the Destinations of each stack, root first', () => {
    const maybeDeepest = Array.last(addressesOf(navigation))
    expect(Option.map(maybeDeepest, address => address.names)).toEqual(
      Option.some(['Shelf', 'Title', 'Listen', 'Contents']),
    )
    expect(Option.map(maybeDeepest, address => address.presentation)).toEqual(
      Option.some('Drawer'),
    )
  })

  it('stops at the depth it is given', () => {
    expect(
      Array.map(addressesOf(navigation, { maxDepth: 2 }), address =>
        pathOfAddress(address.segments, { param: name => `[${name}]` }),
      ),
    ).toEqual(['/shelf', '/shelf/profile', '/shelf/[slug]'])
  })

  it('makes the same samples every time, so a generated file never changes by itself', () => {
    expect(addressesOf(navigation)).toEqual(addressesOf(navigation))
  })
})

// A wrapper adds its screens after the Program's own, as the session's
// settings and the action menu are added over an app: here a sheet named
// by an exact word, declared after a route that takes any name tag.
const Settings = ts('Settings')

const wrapped = screens({
  slug: 'shelf',
  root: rootScreen(Shelf, Route.here, { title: () => 'Shelf' }),
  screens: [
    pushScreen(Title, Route.schemaSegment('slug', TitleSlug), {
      isAllowedAbove: topIs('Shelf'),
    }),
    pushScreen(Listen, Route.literal('listen'), {
      isAllowedAbove: topIs('Title'),
    }),
    presentScreen(Settings, Route.literal('settings'), Sheet(), {
      isAllowedAbove: beneath => !Array.some(beneath, isTagged('Settings')),
    }),
  ],
})

const topNameAt = (uri: string): Option.Option<string> =>
  pipe(
    parseStack(wrapped, uri),
    stack => Array.last(entriesOf(stack)),
    Option.map(entry => entry.destination._tag),
  )

describe('an address a Program prints, parsed back', () => {
  it('is the screen an exact word names, wherever a route that takes any name was declared', () => {
    expect(topNameAt('/shelf/settings')).toEqual(Option.some('Settings'))
    expect(topNameAt('/shelf/moby')).toEqual(Option.some('Title'))
    expect(topNameAt('/shelf/moby/settings')).toEqual(Option.some('Settings'))
    expect(topNameAt('/shelf/moby/listen')).toEqual(Option.some('Listen'))
  })

  it('is the stack it was printed for, for every declared route in every place it may sit', () => {
    const trip = roundTripOf(wrapped)
    expect(trip.faults).toEqual([])
    expect(Array.map(trip.printed, each => each.names)).toEqual([
      ['Shelf'],
      ['Shelf', 'Title'],
      ['Shelf', 'Settings'],
      ['Shelf', 'Title', 'Listen'],
      ['Shelf', 'Title', 'Settings'],
      ['Shelf', 'Title', 'Listen', 'Settings'],
    ])
  })

  it('says which printed address parses back as another stack', () => {
    // A Program that declares the same exact word twice: the second can
    // never be reached by its own address.
    const Other = ts('Other')
    const twice = screens({
      slug: 'shelf',
      root: rootScreen(Shelf, Route.here, { title: () => 'Shelf' }),
      screens: [
        pushScreen(Profile, Route.literal('same'), {}),
        pushScreen(Other, Route.literal('same'), {}),
      ],
    })
    expect(
      Array.findFirst(roundTripOf(twice, { maxDepth: 2 }).faults, fault =>
        Array.last(fault.names).pipe(Option.contains('Other')),
      ),
    ).toEqual(
      Option.some({
        names: ['Shelf', 'Other'],
        printed: '/shelf/same',
        parsedNames: ['Shelf', 'Profile'],
      }),
    )
  })
})
