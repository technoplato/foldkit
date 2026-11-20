import { Array, Option } from 'effect'
import type { Navigation } from 'foldkit'
import { describe, expect, it, vi } from 'vitest'

import {
  entryRouteName,
  entryStateOf,
  screenNameOf,
  screenNamesOf,
} from './stack.js'

vi.mock('react-native', async () => (await import('../test/native.js')).native)
vi.mock('@foldkit/react/interaction', () => ({}))

const entry = (key: string, tag: string, identity: string = key) => ({
  key,
  identity,
  uri: key,
  destination: { _tag: tag },
  maybeStyle: Option.none(),
  maybeTitle: Option.none(),
  isTab: false,
})

const plan: Navigation.CarrierPlan<unknown> = {
  entries: [
    entry('/books', 'LibraryPage'),
    entry('/books/a-title', 'TitlePage'),
    entry(
      '/books/a-title/listen/12s',
      'PlayerPage',
      '/books/a-title/listen/0s',
    ),
  ],
  uri: '/books/a-title/listen/12s',
  history: 'Record',
}

const declared = ['LibraryPage', 'TitlePage', 'PlayerPage', 'ContentsSheet']

describe('the screens a native stack declares', () => {
  it('is one for each Destination the Program declares, and one for anything else', () => {
    expect(screenNamesOf(declared)).toEqual([...declared, entryRouteName])
    expect(screenNamesOf([])).toEqual([entryRouteName])
  })

  it('shows an entry under the name of its Destination, found by the page it is', () => {
    expect(
      screenNameOf(Option.some(plan), '/books/a-title/listen/0s#1', declared),
    ).toBe('PlayerPage')
    expect(screenNameOf(Option.some(plan), '/books', declared)).toBe(
      'LibraryPage',
    )
  })

  it('falls back to the one generic screen for an entry it cannot name', () => {
    expect(screenNameOf(Option.some(plan), '/books/gone', declared)).toBe(
      entryRouteName,
    )
    expect(screenNameOf(Option.none(), '/books', declared)).toBe(entryRouteName)
    expect(screenNameOf(Option.some(plan), '/books', [])).toBe(entryRouteName)
  })

  it('writes each route of a navigator’s state under its screen’s name', () => {
    const state = entryStateOf(
      [
        { key: '/books', uri: '/books' },
        { key: '/books/a-title', uri: '/books/a-title' },
      ],
      key => screenNameOf(Option.some(plan), key, declared),
    )
    expect(Array.map(state.routes, route => route.name)).toEqual([
      'LibraryPage',
      'TitlePage',
    ])
    expect(
      Array.map(
        entryStateOf([{ key: '/books', uri: '/books' }]).routes,
        route => route.name,
      ),
    ).toEqual([entryRouteName])
  })
})
