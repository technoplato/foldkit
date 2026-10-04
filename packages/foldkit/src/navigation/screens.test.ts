import { Array, Option, Schema as S } from 'effect'
import { describe, expect, it } from 'vitest'

import * as Route from '../route/parser.js'
import { ts } from '../schema/index.js'
import { isNotFound, pushScreen, rootScreen, screens } from './declaration.js'
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
