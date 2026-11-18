import { Option } from 'effect'

import {
  type Mode,
  type Role,
  type Theme,
  defaultTheme,
  roleColorsOf,
} from './theme.js'

// TERMINAL

/**
 * What a terminal painter needs to paint from the theme: whether it may
 * use color at all, the mode it was told, and the theme.
 */
export type TerminalInk = Readonly<{
  isColor: boolean
  mode: Mode
  theme: Theme
}>

/**
 * The ink for one terminal output. Color is used only on a terminal, and
 * not when `NO_COLOR` is set or `TERM` is `dumb`, so text sent down a
 * pipe is never marked up. The mode is handed in from the Model, as for
 * every painter.
 *
 * @example
 * ```typescript
 * terminalInkOf({ isTerminal: process.stdout.isTTY === true, env: process.env, mode: 'Dark' })
 * ```
 */
export const terminalInkOf = (
  output: Readonly<{
    isTerminal: boolean
    env: Readonly<Record<string, string | undefined>>
    mode: Mode
    theme?: Theme
  }>,
): TerminalInk => ({
  isColor:
    output.isTerminal &&
    (output.env['NO_COLOR'] ?? '') === '' &&
    output.env['TERM'] !== 'dumb',
  mode: output.mode,
  theme: output.theme ?? defaultTheme,
})

const escape = '\u001b['

const strong = (text: string): string => `${escape}1m${text}${escape}22m`

const dim = (text: string): string => `${escape}2m${text}${escape}22m`

const strongRoles: ReadonlySet<Role> = new Set(['Text', 'ReadingSpoken'])

const dimRoles: ReadonlySet<Role> = new Set([
  'QuietText',
  'FaintText',
  'ReadingToCome',
])

const hexPattern = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i

const channelsOf = (
  color: string,
): Option.Option<readonly [number, number, number]> => {
  const match = hexPattern.exec(color)
  const [, red, green, blue] = match ?? []
  return red === undefined || green === undefined || blue === undefined
    ? Option.none()
    : Option.some([
        Number.parseInt(red, 16),
        Number.parseInt(green, 16),
        Number.parseInt(blue, 16),
      ])
}

/**
 * Text painted for a role in a terminal. A role that is one flat color,
 * such as the accent or the word being spoken, takes that color from the
 * theme in the ink's mode. Body text keeps the terminal's own color,
 * since a terminal's ground is not the theme's to choose: the roles that
 * stand out are strong and the roles that rest are dim. A role that is
 * not a flat color, such as a gradient ground, leaves the text alone, and
 * so does an ink with no color.
 *
 * @example
 * ```typescript
 * inked(ink, 'ReadingCurrentWord', 'lamp') // '\u001b[38;2;157;184;255mlamp\u001b[39m'
 * inked(ink, 'ReadingToCome', 'slow and patient') // dim
 * inked(pipedInk, 'Accent', 'lamp') // 'lamp'
 * ```
 */
export const inked = (ink: TerminalInk, role: Role, text: string): string => {
  if (!ink.isColor) {
    return text
  } else if (strongRoles.has(role)) {
    return strong(text)
  } else if (dimRoles.has(role)) {
    return dim(text)
  } else {
    return Option.match(channelsOf(roleColorsOf(ink.theme, ink.mode)[role]), {
      onNone: () => text,
      onSome: ([red, green, blue]) =>
        `${escape}38;2;${red.toString()};${green.toString()};${blue.toString()}m${text}${escape}39m`,
    })
  }
}

/**
 * A part of one line of a terminal screen and the role it plays: `width`
 * characters from column `col`, such as the word being spoken.
 */
export type InkRun = Readonly<{ col: number; width: number; role: Role }>

/**
 * One line of a terminal screen inked by the roles its parts play. Each
 * part is painted as `inked` paints its role; what no part covers stays
 * as the terminal has it. The parts may come in any order, a part stops
 * at the end of the line, and an ink with no color returns the line as it
 * came, so a frame sent down a pipe is never marked up.
 *
 * @example
 * ```typescript
 * inkedLine(ink, 'He [trimmed] the wick', [
 *   { col: 3, width: 9, role: 'ReadingCurrentWord' },
 * ])
 * // 'He \u001b[38;2;157;184;255m[trimmed]\u001b[39m the wick'
 * ```
 */
export const inkedLine = (
  ink: TerminalInk,
  line: string,
  runs: ReadonlyArray<InkRun>,
): string => {
  if (!ink.isColor) {
    return line
  }
  const ordered = [...runs]
    .filter(run => run.width > 0 && run.col < line.length)
    .sort((first, second) => first.col - second.col)
  const painted = ordered.reduce(
    (state, run) => {
      const start = Math.max(run.col, state.end)
      const end = Math.min(line.length, run.col + run.width)
      return end <= start
        ? state
        : {
            text: `${state.text}${line.slice(state.end, start)}${inked(ink, run.role, line.slice(start, end))}`,
            end,
          }
    },
    { text: '', end: 0 },
  )
  return `${painted.text}${line.slice(painted.end)}`
}
