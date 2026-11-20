import { Option } from 'effect'

import {
  type Contrast,
  type Mode,
  type Role,
  type Theme,
  defaultTheme,
} from './theme.js'

// TERMINAL

/**
 * How text is painted for one terminal output: whether it takes color,
 * the ground the terminal says it has, dark or light, when it says, the
 * contrast it is told, and the theme the colors come from.
 */
export type TerminalInk = Readonly<{
  isColor: boolean
  maybeGround: Mode | undefined
  contrast: Contrast
  theme: Theme
}>

const lightGrounds: ReadonlySet<string> = new Set([
  '7',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
])

const groundPattern = /^\d+$/u

/**
 * The ground a terminal says it has in `COLORFGBG`, `15;0` for light text
 * on black: the last number is the ground's color, 7 and 9 to 15 light,
 * the others dark. Undefined when the terminal does not say.
 */
const groundOfEnv = (
  env: Readonly<Record<string, string | undefined>>,
): Mode | undefined => {
  const last = (env['COLORFGBG'] ?? '').split(';').at(-1) ?? ''
  if (!groundPattern.test(last)) {
    return undefined
  } else {
    return lightGrounds.has(last) ? 'Light' : 'Dark'
  }
}

/**
 * The ink for one terminal output. Color is used only on a terminal, and
 * not when `NO_COLOR` is set or `TERM` is `dumb`, so text sent down a
 * pipe is never marked up. The ground is the terminal's, never the mode
 * a Model holds: `ground` when the host knows it, else what the terminal
 * says in `COLORFGBG`, else not known, and then nothing is assumed. The
 * contrast is handed in from the Model, as for every painter: a terminal
 * cannot be asked, so it is More only where a host reported it.
 *
 * @example
 * ```typescript
 * terminalInkOf({ isTerminal: process.stdout.isTTY === true, env: process.env })
 * ```
 */
export const terminalInkOf = (
  output: Readonly<{
    isTerminal: boolean
    env: Readonly<Record<string, string | undefined>>
    ground?: Mode
    contrast?: Contrast
    theme?: Theme
  }>,
): TerminalInk => ({
  isColor:
    output.isTerminal &&
    (output.env['NO_COLOR'] ?? '') === '' &&
    output.env['TERM'] !== 'dumb',
  maybeGround: output.ground ?? groundOfEnv(output.env),
  contrast: output.contrast ?? 'Standard',
  theme: output.theme ?? defaultTheme,
})

const escape = '\u001b['

const strong = (text: string): string => `${escape}1m${text}${escape}22m`

const focused = (text: string): string => `${escape}1;7m${text}${escape}22;27m`

const underlined = (text: string): string => `${escape}4m${text}${escape}24m`

// What stands out is strong, in the terminal's own color.
const strongRoles: ReadonlySet<Role> = new Set(['Text', 'ReadingSpoken'])

// Focused controls use bold inverse so they read unmistakably on dark,
// light, and unknown grounds without relying on a faint accent color.
const focusedRoles: ReadonlySet<Role> = new Set(['Focus'])

// What is to come keeps the terminal's own text, untouched.
const plainRoles: ReadonlySet<Role> = new Set(['ReadingToCome'])

// What rests is the theme's quiet grey for the ground, never dimmed.
const quietRoles: ReadonlySet<Role> = new Set(['QuietText', 'FaintText'])

const underlinedRoles: ReadonlySet<Role> = new Set(['ReadingCurrentWord'])

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

const linear = (channel: number): number => {
  const part = channel / 255
  return part <= 0.039_28 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4
}

const luminanceOf = (color: string): number =>
  Option.match(channelsOf(color), {
    onNone: () => 0,
    onSome: ([red, green, blue]) =>
      0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue),
  })

/**
 * How well one flat color reads on another, as WCAG counts it: 21 for
 * black on white, 1 for a color on itself, 4.5 the least for body text.
 *
 * @example
 * ```typescript
 * contrastOf('#ffffff', '#000000') // 21
 * ```
 */
export const contrastOf = (first: string, second: string): number => {
  const lighter = Math.max(luminanceOf(first), luminanceOf(second))
  const darker = Math.min(luminanceOf(first), luminanceOf(second))
  return (lighter + 0.05) / (darker + 0.05)
}

const worstOnEither = (color: string): number =>
  Math.min(contrastOf(color, '#000000'), contrastOf(color, '#ffffff'))

/**
 * The flat color a role takes in a terminal: the theme's for the ground
 * the terminal has; with the ground not known, the one of the role's two
 * colors that reads better on both black and white, so nothing is
 * assumed. A quiet role takes the theme's quiet grey, and none with the
 * ground not known, since no grey reads well on both. Undefined for a
 * role that is not one flat color, and for the roles that keep the
 * terminal's own color.
 *
 * @example
 * ```typescript
 * terminalColorOf(ink, 'Accent') // '#fb923c' on a dark ground
 * ```
 */
export const terminalColorOf = (
  ink: TerminalInk,
  role: Role,
): string | undefined => {
  if (strongRoles.has(role) || focusedRoles.has(role) || plainRoles.has(role)) {
    return undefined
  }
  const colors = ink.theme[quietRoles.has(role) ? 'QuietText' : role]
  const isFlat = (color: string): boolean => Option.isSome(channelsOf(color))
  if (ink.maybeGround !== undefined) {
    const isDark = ink.maybeGround === 'Dark'
    const standard = isDark ? colors.dark : colors.light
    const maybeMore = isDark ? colors.darkMore : colors.lightMore
    const color =
      ink.contrast === 'More' && maybeMore !== undefined ? maybeMore : standard
    return isFlat(color) ? color : undefined
  } else if (quietRoles.has(role)) {
    return undefined
  } else if (isFlat(colors.light) && isFlat(colors.dark)) {
    return worstOnEither(colors.light) >= worstOnEither(colors.dark)
      ? colors.light
      : colors.dark
  } else {
    return undefined
  }
}

const colored = (color: string, text: string): string =>
  Option.match(channelsOf(color), {
    onNone: () => text,
    onSome: ([red, green, blue]) =>
      `${escape}38;2;${red.toString()};${green.toString()};${blue.toString()}m${text}${escape}39m`,
  })

/**
 * Text painted for a role in a terminal. What stands out, a heading and
 * the words already spoken, is strong in the terminal's own color, and
 * what is to come is left as it is, since a terminal's body text is not
 * the theme's to choose. A role that is one flat color takes it from the
 * theme for the terminal's ground (see {@link terminalColorOf}); the word
 * being read is underlined as well, so it shows whatever the color.
 * Nothing is ever dimmed: a dimmed line is hard to read on a dark ground.
 * A role that is not a flat color leaves the text alone, and so does an
 * ink with no color.
 *
 * @example
 * ```typescript
 * inked(ink, 'ReadingCurrentWord', 'lamp') // underlined, in the theme's color
 * inked(ink, 'ReadingSpoken', 'He trimmed') // strong
 * inked(pipedInk, 'Accent', 'lamp') // 'lamp'
 * ```
 */
export const inked = (ink: TerminalInk, role: Role, text: string): string => {
  if (!ink.isColor) {
    return text
  } else if (focusedRoles.has(role)) {
    return focused(text)
  } else if (strongRoles.has(role)) {
    return strong(text)
  } else {
    const color = terminalColorOf(ink, role)
    const painted = color === undefined ? text : colored(color, text)
    return underlinedRoles.has(role) ? underlined(painted) : painted
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
