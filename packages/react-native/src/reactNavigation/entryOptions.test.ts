import { Option } from 'effect'
import type { Navigation } from 'foldkit'
import { describe, expect, it, vi } from 'vitest'

import type { AnyBound } from '@foldkit/react/interaction'

import { entryOptionsOf } from './entryOptions.js'

vi.mock('react-native', async () => (await import('../test/native.js')).native)
vi.mock('@foldkit/react/interaction', () => ({}))

const entry = (key: string, title: string, isTab: boolean) => ({
  key,
  identity: key,
  uri: key,
  destination: { _tag: title },
  maybeStyle: Option.none(),
  maybeTitle: Option.some(title),
  isTab,
})

const plan: Navigation.CarrierPlan<unknown> = {
  entries: [
    entry('/books', 'Library', false),
    entry('/books/profile', 'Profile', true),
    entry('/books/profile/audible', 'Import from Audible', false),
  ],
  uri: '/books/profile/audible',
  history: 'Record',
}

const bound: Pick<AnyBound, 'navigation'> = {
  navigation: () => Option.some(plan),
}

describe('the native stack options of a page a tab bar reaches', () => {
  it('arrives in place, with no back button and no swipe back', () => {
    expect(entryOptionsOf(bound, '/books/profile')).toMatchObject({
      presentation: 'card',
      title: 'Profile',
      animation: 'none',
      headerBackVisible: false,
      gestureEnabled: false,
    })
  })

  it('leaves every other page its own way back', () => {
    const library = entryOptionsOf(bound, '/books')
    const audible = entryOptionsOf(bound, '/books/profile/audible')
    expect(library).not.toHaveProperty('animation')
    expect(library).not.toHaveProperty('headerBackVisible')
    expect(audible).not.toHaveProperty('gestureEnabled')
    expect(audible).not.toHaveProperty('headerBackVisible')
  })

  it('keeps the page beneath a tab mounted and still, so it keeps its place', () => {
    expect(entryOptionsOf(bound, '/books').freezeOnBlur).toBe(true)
  })
})
