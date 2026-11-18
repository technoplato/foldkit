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

  it('keeps the grounds and the plain text as they are', () => {
    for (const mode of ['Light', 'Dark'] as const) {
      const standard = roleColorsOf(defaultTheme, mode)
      const more = roleColorsOf(defaultTheme, mode, 'More')
      for (const role of ['PageGround', 'Text', 'ReadingSpoken'] as const) {
        expect(more[role]).toBe(standard[role])
      }
    }
  })
})
