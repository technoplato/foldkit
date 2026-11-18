import { Array, Record, Schema as S, String, pipe } from 'effect'

// THEME

/**
 * How a person wants a Program to look: follow the system, or always
 * light, or always dark. It is state in the Model, set by an Action and
 * synced like any choice; no component asks the system by itself.
 */
export const Appearance = S.Literals(['System', 'Light', 'Dark'])
/** How a person wants a Program to look. */
export type Appearance = typeof Appearance.Type

/** The mode a Program is painted in. */
export const Mode = S.Literals(['Light', 'Dark'])
/** The mode a Program is painted in. */
export type Mode = typeof Mode.Type

/**
 * What a color is for. A screen and its styling name roles, never colors:
 * the ground of the page, a surface on it and a surface raised above
 * that, text and quieter text, the accent and its soft ground, a rule,
 * the focus ring, danger, and the roles of words read along with: their
 * ground, the words already spoken, the words to come, the word being
 * spoken and its ground, the ground of the paragraph being read, and the
 * rule beside it.
 */
export const Role = S.Literals([
  'PageGround',
  'Surface',
  'RaisedSurface',
  'Text',
  'QuietText',
  'Accent',
  'AccentSoft',
  'Rule',
  'Focus',
  'Danger',
  'ReadingGround',
  'ReadingSpoken',
  'ReadingToCome',
  'ReadingCurrentWord',
  'ReadingCurrentWordGround',
  'ReadingCurrentGround',
  'ReadingRule',
])
/** What a color is for. */
export type Role = typeof Role.Type

/** A role's color in each mode. */
export type RoleColors = Readonly<{ light: string; dark: string }>

/** A theme: every role's color, light and dark. */
export type Theme = Readonly<Record<Role, RoleColors>>

/**
 * The theme a Program has unless it says otherwise. Light is clean, dark
 * text on white with an orange accent. Dark is a near-black page with
 * the reader on a ground that runs from dark green to black, the words
 * already spoken in white, those to come in grey, the word being spoken
 * in blue.
 */
export const defaultTheme: Theme = {
  PageGround: { light: '#ffffff', dark: '#0b0d0c' },
  Surface: { light: '#f3f4f6', dark: '#161a18' },
  RaisedSurface: { light: '#ffffff', dark: '#1f2522' },
  Text: { light: '#111827', dark: '#f3f4f6' },
  QuietText: { light: '#6b7280', dark: '#9aa1aa' },
  Accent: { light: '#ea580c', dark: '#fb923c' },
  AccentSoft: { light: '#ffedd5', dark: '#3a2414' },
  Rule: { light: '#e5e7eb', dark: '#2a302d' },
  Focus: { light: '#2563eb', dark: '#93c5fd' },
  Danger: { light: '#b91c1c', dark: '#fca5a5' },
  ReadingGround: {
    light: 'transparent',
    dark: 'linear-gradient(#12301d, #060907 42%)',
  },
  ReadingSpoken: { light: '#111827', dark: '#ffffff' },
  ReadingToCome: { light: '#6b7280', dark: '#8d949e' },
  ReadingCurrentWord: { light: '#c2410c', dark: '#9db8ff' },
  ReadingCurrentWordGround: { light: '#ffedd5', dark: 'transparent' },
  ReadingCurrentGround: {
    light: '#e8ecf2',
    dark: 'rgba(255, 255, 255, 0.06)',
  },
  ReadingRule: { light: '#ea580c', dark: '#6ea0ff' },
}

/**
 * A theme with some roles replaced, the rest kept: how a Program or a
 * component makes its own look out of another, by function.
 *
 * @example
 * ```typescript
 * const forest = withRoles(defaultTheme, { Accent: { light: '#166534', dark: '#86efac' } })
 * ```
 */
export const withRoles = (
  theme: Theme,
  roles: Readonly<Partial<Record<Role, RoleColors>>>,
): Theme => ({ ...theme, ...roles })

/**
 * The mode an appearance resolves to: the chosen one, or the system's
 * mode when the choice is to follow it. The system's mode is handed in,
 * a fact that reached the Program as a Message; this never asks for it.
 *
 * @example
 * ```typescript
 * modeOf('System', 'Dark') // 'Dark'
 * modeOf('Light', 'Dark') // 'Light'
 * ```
 */
export const modeOf = (appearance: Appearance, systemMode: Mode): Mode =>
  appearance === 'System' ? systemMode : appearance

/** Each role's color in one mode, as a painter reads them. */
export const roleColorsOf = (
  theme: Theme,
  mode: Mode,
): Readonly<Record<Role, string>> =>
  Record.map(theme, colors => (mode === 'Dark' ? colors.dark : colors.light))

/**
 * The CSS variable a role is declared as: `--fk-page-ground` for
 * `PageGround`.
 */
export const cssVariableOf = (role: Role): string =>
  `--fk-${pipe(role, String.replace(/([a-z])([A-Z])/g, '$1-$2'), String.toLowerCase)}`

/**
 * How a rule in a stylesheet names a role's color: `var(--fk-quiet-text)`
 * for `QuietText`. A stylesheet uses these and no color of its own.
 */
export const roleVar = (role: Role): string => `var(${cssVariableOf(role)})`

/** One CSS declaration per role, for one mode. */
export const cssVariablesOf = (
  theme: Theme,
  mode: Mode,
): ReadonlyArray<string> => {
  const colors = roleColorsOf(theme, mode)
  return Array.map(
    Role.literals,
    role => `${cssVariableOf(role)}: ${colors[role]};`,
  )
}

/** The attribute a DOM painter sets from the Model's mode. */
export const modeAttribute = 'data-fk-mode'

const declarationsOf = (theme: Theme, mode: Mode): string =>
  pipe(
    cssVariablesOf(theme, mode),
    Array.map(declaration => `  ${declaration}`),
    Array.join('\n'),
  )

/**
 * The stylesheet that declares a theme for the DOM: every role as a CSS
 * variable, light by default, and dark on and under an element whose
 * `data-fk-mode` is `Dark`. The DOM painter sets that attribute from the
 * mode in the Model; nothing here asks the system which mode it is in.
 *
 * @example
 * ```typescript
 * themeStylesheet(defaultTheme)
 * // ':where(:root) {\n  --fk-page-ground: #ffffff;\n  …\n}\n\n:where([data-fk-mode="Dark"]) {\n  --fk-page-ground: #0b0d0c;\n  …\n}'
 * ```
 */
export const themeStylesheet = (theme: Theme): string =>
  [
    `:where(:root) {\n${declarationsOf(theme, 'Light')}\n}`,
    `:where([${modeAttribute}="Light"]) {\n${declarationsOf(theme, 'Light')}\n}`,
    `:where([${modeAttribute}="Dark"]) {\n${declarationsOf(theme, 'Dark')}\n}`,
  ].join('\n\n')
