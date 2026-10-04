import { Array, Option, Schema as S, pipe } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Route from '../route/parser.js'
import { ts } from '../schema/index.js'
import { planOf } from './carrier.js'
import {
  isNotFound,
  presentScreen,
  pushScreen,
  rootScreen,
  screens,
} from './declaration.js'
import { Sheet } from './structure.js'
import { parseStack } from './uri.js'

const Shelf = ts('Shelf')
const Book = ts('Book')
const Player = ts('Player')

const isShelf = S.is(Shelf)
const isBook = S.is(Book)

const navigation = screens({
  slug: 'shelf',
  root: rootScreen(Shelf, Route.here),
  screens: [
    pushScreen(Book, Route.literal('book'), {
      isAllowedAbove: beneath => Array.every(beneath, isShelf),
    }),
    pushScreen(Player, Route.literal('player'), {
      isAllowedAbove: beneath =>
        Option.exists(Array.last(beneath), top => isShelf(top) || isBook(top)),
    }),
  ],
})

const tagsOf = (uri: string): ReadonlyArray<string> => {
  const stack = parseStack(navigation, uri)
  return Array.map([stack.root, ...stack.pages], destination =>
    isNotFound(destination) ? 'NotFound' : destination._tag,
  )
}

describe('screens', () => {
  it('lets a screen read every kind of screen beneath it', () => {
    expect(tagsOf('/shelf/book/player')).toEqual(['Shelf', 'Book', 'Player'])
    expect(tagsOf('/shelf/player')).toEqual(['Shelf', 'Player'])
    expect(tagsOf('/shelf/player/player')).not.toEqual([
      'Shelf',
      'Player',
      'Player',
    ])
    expect(tagsOf('/shelf/player/book')).not.toEqual([
      'Shelf',
      'Player',
      'Book',
    ])
  })
})

const Listening = ts('Listening', { atMs: S.Int })
const Chapters = ts('Chapters')

const listeningNavigation = screens({
  slug: 'shelf',
  root: rootScreen(Shelf, Route.here),
  screens: [
    pushScreen(
      Listening,
      pipe(
        Route.literal('listen'),
        Route.slash(
          Route.schemaSegment(
            'atMs',
            S.NumberFromString.pipe(S.decodeTo(S.Int)),
          ),
        ),
      ),
      { identityOf: () => Listening({ atMs: 0 }) },
    ),
    presentScreen(Chapters, Route.literal('chapters'), Sheet()),
  ],
})

const entriesAt = (uri: string) =>
  Option.match(
    planOf(listeningNavigation, {}, parseStack(listeningNavigation, uri)),
    {
      onNone: () => [],
      onSome: plan =>
        Array.map(plan.entries, entry => [entry.key, entry.identity]),
    },
  )

describe('identityOf', () => {
  it('keeps one identity while a passing field moves the address', () => {
    expect(entriesAt('/shelf/listen/723000/chapters')).toEqual([
      ['/shelf', '/shelf'],
      ['/shelf/listen/723000', '/shelf/listen/0'],
      ['/shelf/listen/723000/chapters', '/shelf/listen/0/chapters'],
    ])
    expect(entriesAt('/shelf/listen/724000')).toEqual([
      ['/shelf', '/shelf'],
      ['/shelf/listen/724000', '/shelf/listen/0'],
    ])
  })
})
