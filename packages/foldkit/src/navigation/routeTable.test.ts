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
import { addressesOf, pathOfAddress, routeTableOf } from './routeTable.js'
import { Drawer } from './structure.js'

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
