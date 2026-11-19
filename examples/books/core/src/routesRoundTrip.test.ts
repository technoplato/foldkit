import { Array, pipe } from 'effect'
import { Navigation } from 'foldkit'
import { roundTripOf, routeTableOf } from 'foldkit/navigation/route-table'
import { describe, expect, it } from 'vitest'

import { App } from './app.js'

// NOTE: The whole Program: Books' own screens, and the session's settings
// and the action menu that are added over them. A shared link or a deep
// link is a printed address, so each must open the screen it was printed
// for, on every Client.
const navigation = App.navigation

const namesAt = (uri: string): ReadonlyArray<string> => {
  const stack = Navigation.parseStack(navigation, uri)
  return Array.map(
    [stack.root, ...Array.map(Navigation.entriesOf(stack), e => e.destination)],
    destination => destination._tag,
  )
}

describe('every address Books prints', () => {
  const trip = roundTripOf(navigation, { maxDepth: 4 })

  it('parses back to the stack it was printed for', () => {
    expect(trip.faults).toEqual([])
  })

  it('covers every route Books declares, at least once', () => {
    const tried = new Set(Array.flatMap(trip.printed, each => each.names))
    expect(
      pipe(
        routeTableOf(navigation),
        Array.map(row => row.name),
        Array.filter(name => !tried.has(name)),
      ),
    ).toEqual([])
    expect(trip.printed.length).toBeGreaterThan(50)
  })

  it('opens the session’s settings and the action menu over the library, not a title of that name', () => {
    expect(namesAt('/books/session')).toEqual([
      'LibraryPage',
      'SessionSettings',
    ])
    expect(namesAt('/books/menu')).toEqual(['LibraryPage', 'ActionMenu'])
    expect(namesAt('/books/the-lantern-keeper')).toEqual([
      'LibraryPage',
      'TitlePage',
    ])
    expect(namesAt('/books/the-lantern-keeper/session')).toEqual([
      'LibraryPage',
      'TitlePage',
      'SessionSettings',
    ])
  })
})
