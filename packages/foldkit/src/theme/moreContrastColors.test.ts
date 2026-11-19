import { describe, expect, it } from 'vitest'

import { contrastOf } from './terminal.js'
import { type Role, defaultTheme, roleColorsOf } from './theme.js'

// What is read: text and marks that sit on the page's ground.
const read: ReadonlyArray<Role> = [
  'QuietText',
  'FaintText',
  'ReadingToCome',
  'Accent',
  'Link',
  'ReadingCurrentWord',
  'ReadingRule',
  'Danger',
  'Positive',
  'Warning',
  'Mark',
  'SelectedMark',
]

// What marks an edge: the lines between things.
const edges: ReadonlyArray<Role> = ['Rule', 'Border']

const grounds = { Light: '#ffffff', Dark: '#0b0d0c' } as const

describe('the default theme under More Contrast', () => {
  it.each(['Light', 'Dark'] as const)(
    'reads every text and mark at 7 to 1 or better on the %s ground',
    mode => {
      const colors = roleColorsOf(defaultTheme, mode, 'More')
      for (const role of read) {
        expect(
          contrastOf(colors[role], grounds[mode]),
          `${role} in ${mode}`,
        ).toBeGreaterThanOrEqual(7)
      }
    },
  )

  it.each(['Light', 'Dark'] as const)(
    'draws every edge at 3 to 1 or better on the %s ground',
    mode => {
      const colors = roleColorsOf(defaultTheme, mode, 'More')
      for (const role of edges) {
        expect(
          contrastOf(colors[role], grounds[mode]),
          `${role} in ${mode}`,
        ).toBeGreaterThanOrEqual(3)
      }
    },
  )

  it.each(['Light', 'Dark'] as const)(
    'never reads worse than it does without it, in %s',
    mode => {
      const standard = roleColorsOf(defaultTheme, mode)
      const more = roleColorsOf(defaultTheme, mode, 'More')
      for (const role of [...read, ...edges]) {
        expect(
          contrastOf(more[role], grounds[mode]),
          `${role} in ${mode}`,
        ).toBeGreaterThanOrEqual(contrastOf(standard[role], grounds[mode]))
      }
    },
  )

  it('keeps the page ground and the plain text as they are', () => {
    for (const mode of ['Light', 'Dark'] as const) {
      const standard = roleColorsOf(defaultTheme, mode)
      const more = roleColorsOf(defaultTheme, mode, 'More')
      for (const role of ['PageGround', 'Text'] as const) {
        expect(more[role]).toBe(standard[role])
      }
    }
  })
})

// A reader finds their place by the words already read against the words
// to come. Both must read well, and they must not look alike.
describe('the place in a paragraph under More Contrast', () => {
  const flat = /^#[0-9a-f]{6}$/

  // The grounds the words of a transcript sit on: the page, and the
  // paragraph being read.
  const groundsOf = (mode: 'Light' | 'Dark'): ReadonlyArray<string> => {
    const colors = roleColorsOf(defaultTheme, mode, 'More')
    return [grounds[mode], colors.ReadingCurrentGround]
  }

  it.each(['Light', 'Dark'] as const)(
    'paints its reading grounds as one flat color each, in %s',
    mode => {
      const colors = roleColorsOf(defaultTheme, mode, 'More')
      expect(['transparent', grounds[mode]]).toContain(colors.ReadingGround)
      expect(colors.ReadingCurrentGround).toMatch(flat)
    },
  )

  it.each(['Light', 'Dark'] as const)(
    'reads the words read and the words to come at 7 to 1 or better on the page and on the paragraph being read, in %s',
    mode => {
      const colors = roleColorsOf(defaultTheme, mode, 'More')
      for (const ground of groundsOf(mode)) {
        for (const role of ['ReadingSpoken', 'ReadingToCome'] as const) {
          expect(
            contrastOf(colors[role], ground),
            `${role} on ${ground} in ${mode}`,
          ).toBeGreaterThanOrEqual(7)
        }
      }
    },
  )

  it.each(['Light', 'Dark'] as const)(
    'tells the words read from the words to come by 2.3 to 1 or more, in %s',
    mode => {
      const colors = roleColorsOf(defaultTheme, mode, 'More')
      expect(
        contrastOf(colors.ReadingSpoken, colors.ReadingToCome),
      ).toBeGreaterThanOrEqual(2.3)
    },
  )

  it.each(['Light', 'Dark'] as const)(
    'reads the word being read at 7 to 1 or better on the ground it has, in %s',
    mode => {
      const colors = roleColorsOf(defaultTheme, mode, 'More')
      const ground = flat.test(colors.ReadingCurrentWordGround)
        ? colors.ReadingCurrentWordGround
        : colors.ReadingCurrentGround
      expect(
        contrastOf(colors.ReadingCurrentWord, ground),
      ).toBeGreaterThanOrEqual(7)
    },
  )
})
