import { describe, expect, it } from 'vitest'

import {
  contrastOf,
  inked,
  terminalColorOf,
  terminalInkOf,
} from './terminal.js'
import { Role, defaultTheme } from './theme.js'

const escape = '\u001b['

const onDark = terminalInkOf({ isTerminal: true, env: {}, ground: 'Dark' })

const onLight = terminalInkOf({ isTerminal: true, env: {}, ground: 'Light' })

const unknown = terminalInkOf({ isTerminal: true, env: {} })

describe('the theme in a terminal', () => {
  it('paints the color of a role from the theme, for the ground the terminal has', () => {
    expect(inked(onDark, 'Accent', 'lamp')).toBe(
      `${escape}38;2;251;146;60mlamp${escape}39m`,
    )
    expect(inked(onLight, 'Accent', 'lamp')).toBe(
      `${escape}38;2;234;88;12mlamp${escape}39m`,
    )
  })

  it('reads the ground a terminal says it has, and takes none for granted', () => {
    const says = (colorfgbg: string) =>
      terminalInkOf({ isTerminal: true, env: { COLORFGBG: colorfgbg } })
        .maybeGround
    expect(says('15;0')).toBe('Dark')
    expect(says('0;15')).toBe('Light')
    expect(says('12;default;7')).toBe('Light')
    expect(says('nonsense')).toBeUndefined()
    expect(unknown.maybeGround).toBeUndefined()
  })

  it('underlines the word being read as well as coloring it, so it shows whatever the color', () => {
    expect(inked(onDark, 'ReadingCurrentWord', 'lamp')).toBe(
      `${escape}4m${escape}38;2;157;184;255mlamp${escape}39m${escape}24m`,
    )
  })

  it('keeps body text in the color the terminal has: strong for what stands out, plain for what is to come', () => {
    expect(inked(onDark, 'ReadingSpoken', 'He trimmed')).toBe(
      `${escape}1mHe trimmed${escape}22m`,
    )
    expect(inked(onDark, 'Text', 'The Lantern Keeper')).toBe(
      `${escape}1mThe Lantern Keeper${escape}22m`,
    )
    expect(inked(onDark, 'ReadingToCome', 'slow and patient')).toBe(
      'slow and patient',
    )
  })

  it('never dims: what rests is a grey from the theme with real contrast on the ground, and plain where the ground is not known', () => {
    expect(inked(onDark, 'QuietText', '0:21')).toBe(
      `${escape}38;2;154;161;170m0:21${escape}39m`,
    )
    expect(inked(onLight, 'QuietText', '0:21')).toBe(
      `${escape}38;2;107;114;128m0:21${escape}39m`,
    )
    expect(inked(unknown, 'QuietText', '0:21')).toBe('0:21')
    expect(inked(unknown, 'FaintText', '0:21')).toBe('0:21')
    for (const ink of [onDark, onLight, unknown]) {
      for (const role of Role.literals) {
        expect(inked(ink, role, 'x')).not.toContain(`${escape}2m`)
      }
    }
  })

  it('reads on the ground it paints for: every role it colors has a contrast of at least 4.5 there', () => {
    const colored = [
      'Accent',
      'ReadingCurrentWord',
      'QuietText',
      'Mark',
    ] as const
    for (const role of colored) {
      expect(
        contrastOf(terminalColorOf(onDark, role) ?? '', '#000000'),
        `${role} on black`,
      ).toBeGreaterThanOrEqual(4.5)
      expect(
        contrastOf(terminalColorOf(onDark, role) ?? '', '#1e1e1e'),
        `${role} on a dark grey`,
      ).toBeGreaterThanOrEqual(4.5)
      expect(
        contrastOf(terminalColorOf(onLight, role) ?? '', '#ffffff'),
        `${role} on white`,
      ).toBeGreaterThanOrEqual(3)
    }
  })

  it('with the ground not known, takes of a role’s two colors the one that reads better on both black and white', () => {
    for (const role of ['Accent', 'ReadingCurrentWord', 'Mark'] as const) {
      const color = terminalColorOf(unknown, role) ?? ''
      const worst = (hex: string) =>
        Math.min(contrastOf(hex, '#000000'), contrastOf(hex, '#ffffff'))
      expect(worst(color)).toBe(
        Math.max(
          worst(defaultTheme[role].light),
          worst(defaultTheme[role].dark),
        ),
      )
      expect(worst(color), role).toBeGreaterThanOrEqual(3)
    }
  })

  it('takes a role’s stronger color when it is told the contrast is More', () => {
    const more = terminalInkOf({
      isTerminal: true,
      env: {},
      ground: 'Light',
      contrast: 'More',
    })
    expect(terminalColorOf(more, 'Accent')).toBe(defaultTheme.Accent.lightMore)
    expect(terminalColorOf(more, 'QuietText')).toBe(
      defaultTheme.QuietText.lightMore,
    )
    expect(terminalColorOf(onLight, 'Accent')).toBe(defaultTheme.Accent.light)
    const darkMore = terminalInkOf({
      isTerminal: true,
      env: {},
      ground: 'Dark',
      contrast: 'More',
    })
    expect(terminalColorOf(darkMore, 'QuietText')).toBe(
      defaultTheme.QuietText.darkMore,
    )
  })

  it('leaves text alone for a role that is not one flat color', () => {
    expect(inked(onDark, 'ReadingGround', 'words')).toBe('words')
  })

  it('paints nothing when the output is not a terminal, or color is refused', () => {
    const piped = terminalInkOf({ isTerminal: false, env: {} })
    expect(inked(piped, 'ReadingCurrentWord', 'lamp')).toBe('lamp')
    const refused = terminalInkOf({ isTerminal: true, env: { NO_COLOR: '1' } })
    expect(inked(refused, 'Accent', 'lamp')).toBe('lamp')
    const dumb = terminalInkOf({ isTerminal: true, env: { TERM: 'dumb' } })
    expect(inked(dumb, 'Accent', 'lamp')).toBe('lamp')
  })
})
