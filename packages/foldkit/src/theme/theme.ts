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
 * How much contrast a Program is painted with: the usual, or more, for a
 * person whose device asks for it. Like the mode it is state in the
 * Model, heard from the host as a fact; no painter or stylesheet asks.
 */
export const Contrast = S.Literals(['Standard', 'More'])
/** How much contrast a Program is painted with. */
export type Contrast = typeof Contrast.Type

/**
 * What a color is for. A screen and its styling name roles, never colors:
 * the ground of the page, a surface on it and a surface raised above
 * that, text and quieter text, the accent and its soft ground, a rule,
 * the focus ring, danger, fainter text, a link, a border, a field, a
 * button with its hover, disabled and label colors, the scrim behind a
 * sheet, a veil over what scrolls beneath a bar, a shadow, a selected
 * row and its mark, a warning, a device's frame, and the roles of words
 * read along with: their
 * ground, the words already spoken, the words to come, the word being
 * spoken and its ground, the ground of the paragraph being read, and the
 * rule beside it; then a stronger field, the strong, filled and soft
 * forms of danger, a positive color and its soft ground, a soft warning,
 * and the ground of a bar. A domain adds what is its own beside these
 * with {@link withOwnRoles}.
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
  'FaintText',
  'Link',
  'Border',
  'Field',
  'Button',
  'ButtonHover',
  'ButtonDisabled',
  'ButtonLabel',
  'Scrim',
  'Veil',
  'Shadow',
  'Selected',
  'SelectedMark',
  'Warning',
  'DeviceBorder',
  'Mark',
  'MarkSoft',
  'ReadingGround',
  'ReadingSpoken',
  'ReadingToCome',
  'ReadingCurrentWord',
  'ReadingCurrentWordGround',
  'ReadingCurrentGround',
  'ReadingRule',
  'FieldStrong',
  'DangerStrong',
  'DangerFill',
  'DangerSoft',
  'Positive',
  'PositiveSoft',
  'WarningSoft',
  'BarGround',
])
/** What a color is for. */
export type Role = typeof Role.Type

/**
 * A role's color in each mode, and, where the role is stronger under
 * More Contrast, its color then: `lightMore` and `darkMore`. A role that
 * names none keeps its usual color.
 */
export type RoleColors = Readonly<{
  light: string
  dark: string
  lightMore?: string
  darkMore?: string
}>

const colorOf = (
  colors: RoleColors,
  mode: Mode,
  contrast: Contrast,
): string => {
  const usual = mode === 'Dark' ? colors.dark : colors.light
  const maybeMore = mode === 'Dark' ? colors.darkMore : colors.lightMore
  return contrast === 'More' ? (maybeMore ?? usual) : usual
}

/** A theme: every role's color, light and dark. */
export type Theme = Readonly<Record<Role, RoleColors>>

/**
 * The theme a Program has unless it says otherwise. Light is clean, dark
 * text on white with an orange accent. Dark is a near-black page with
 * the reader on a ground that runs from dark green to black, the words
 * already spoken in white, those to come in grey, the word being spoken
 * in blue.
 *
 * Under More Contrast every text and mark reads at 7 to 1 or better on
 * the page's ground and every edge at 3 to 1: a role names a stronger
 * colour (`lightMore`, `darkMore`) wherever its own falls short, and the
 * grounds and plain text stay as they are.
 */
export const defaultTheme: Theme = {
  PageGround: { light: '#ffffff', dark: '#0b0d0c' },
  Surface: { light: '#f3f4f6', dark: '#161a18' },
  RaisedSurface: { light: '#ffffff', dark: '#1f2522' },
  Text: { light: '#111827', dark: '#f3f4f6' },
  QuietText: {
    light: '#6b7280',
    dark: '#9aa1aa',
    lightMore: '#374151',
    darkMore: '#d1d5db',
  },
  Accent: { light: '#ea580c', dark: '#fb923c', lightMore: '#9a3412' },
  AccentSoft: { light: '#ffedd5', dark: '#3a2414' },
  Rule: {
    light: '#e5e7eb',
    dark: '#2a302d',
    lightMore: '#6b7280',
    darkMore: '#6b7280',
  },
  Focus: { light: '#111827', dark: '#93c5fd' },
  Danger: { light: '#b91c1c', dark: '#fca5a5', lightMore: '#7f1d1d' },
  FaintText: {
    light: '#9ca3af',
    dark: '#6b7280',
    lightMore: '#4b5563',
    darkMore: '#b6bcc6',
  },
  Link: { light: '#2563eb', dark: '#93c5fd', lightMore: '#1e40af' },
  Border: {
    light: '#d1d5db',
    dark: '#3a403d',
    lightMore: '#4b5563',
    darkMore: '#8d949e',
  },
  Field: { light: '#f9fafb', dark: '#161a18' },
  Button: { light: '#000000', dark: '#f3f4f6' },
  ButtonHover: { light: '#374151', dark: '#d1d5db' },
  ButtonDisabled: { light: '#d1d5db', dark: '#3a403d' },
  ButtonLabel: { light: '#ffffff', dark: '#0b0d0c' },
  Scrim: { light: 'rgba(15, 23, 42, 0.4)', dark: 'rgba(0, 0, 0, 0.6)' },
  Veil: { light: 'rgba(255, 255, 255, 0.94)', dark: 'rgba(11, 13, 12, 0.92)' },
  Shadow: { light: 'rgba(15, 23, 42, 0.3)', dark: 'rgba(0, 0, 0, 0.6)' },
  Selected: { light: '#eef2ff', dark: '#23264a' },
  SelectedMark: { light: '#4f46e5', dark: '#a5b4fc', lightMore: '#3730a3' },
  Warning: { light: '#b45309', dark: '#fbbf24', lightMore: '#78350f' },
  DeviceBorder: { light: '#3f3f46', dark: '#52525b' },
  Mark: { light: '#7c3aed', dark: '#c4b5fd', lightMore: '#5b21b6' },
  MarkSoft: { light: '#ede9fe', dark: '#2e2350' },
  ReadingGround: {
    light: 'transparent',
    dark: 'linear-gradient(#12301d, #060907 42%)',
  },
  ReadingSpoken: { light: '#111827', dark: '#ffffff' },
  ReadingToCome: {
    light: '#6b7280',
    dark: '#8d949e',
    lightMore: '#374151',
    darkMore: '#c7ccd4',
  },
  ReadingCurrentWord: {
    light: '#c2410c',
    dark: '#9db8ff',
    lightMore: '#9a3412',
  },
  ReadingCurrentWordGround: { light: '#ffedd5', dark: 'transparent' },
  ReadingCurrentGround: {
    light: '#e8ecf2',
    dark: 'rgba(255, 255, 255, 0.06)',
  },
  ReadingRule: { light: '#ea580c', dark: '#6ea0ff', lightMore: '#9a3412' },
  FieldStrong: { light: '#e5e7eb', dark: '#2a302d' },
  DangerStrong: { light: '#991b1b', dark: '#fecaca' },
  DangerFill: { light: '#b91c1c', dark: '#b91c1c' },
  DangerSoft: { light: '#fee2e2', dark: '#3b1414' },
  Positive: { light: '#15803d', dark: '#86efac', lightMore: '#14532d' },
  PositiveSoft: { light: '#dcfce7', dark: '#12301d' },
  WarningSoft: { light: '#fef3c7', dark: '#3a2a0c' },
  BarGround: {
    light: 'rgba(243, 244, 246, 0.92)',
    dark: 'rgba(11, 13, 12, 0.9)',
  },
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

/**
 * Each role's color in one mode, at the usual contrast or with more, as
 * a painter reads them.
 */
export const roleColorsOf = (
  theme: Theme,
  mode: Mode,
  contrast: Contrast = 'Standard',
): Readonly<Record<Role, string>> =>
  Record.map(theme, colors => colorOf(colors, mode, contrast))

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

const kebabOf = (name: string): string =>
  pipe(name, String.replace(/([a-z0-9])([A-Z])/g, '$1-$2'), String.toLowerCase)

/**
 * Roles a domain adds beside the library's: what a color is for in that
 * domain alone, such as the badge of a recording in progress. Each has a
 * light and a dark color, is declared with the theme, and is named by a
 * rule with {@link ownRoleVar}.
 */
export type OwnRoles = Readonly<Record<string, RoleColors>>

const isLibraryRole = (name: string): boolean =>
  Array.some(Role.literals, role => role === name)

/**
 * A domain's own roles, checked: a name the library already uses is
 * refused, so a domain overrides a library role with {@link withRoles}
 * and never shadows one by accident.
 *
 * @example
 * ```typescript
 * const own = withOwnRoles({ BadgeRecording: { light: '#b50012', dark: '#ffa198' } })
 * themeStylesheet(theme, own)
 * ```
 */
export const withOwnRoles = (roles: OwnRoles): OwnRoles => {
  const taken = Array.filter(Record.keys(roles), isLibraryRole)
  if (Array.isReadonlyArrayNonEmpty(taken)) {
    throw new Error(
      `The library already has a role called ${Array.join(taken, ', ')}. Give it a color with withRoles, or name the domain's role something else.`,
    )
  }
  return roles
}

/** The CSS variable a domain's own role is declared as: `--fk-own-badge-recording`. */
export const ownCssVariableOf = (name: string): string =>
  `--fk-own-${kebabOf(name)}`

/** How a rule names a domain's own role: `var(--fk-own-badge-recording)`. */
export const ownRoleVar = (name: string): string =>
  `var(${ownCssVariableOf(name)})`

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

const ownVariablesOf = (own: OwnRoles, mode: Mode): ReadonlyArray<string> =>
  Array.map(
    Record.toEntries(own),
    ([name, colors]) =>
      `${ownCssVariableOf(name)}: ${mode === 'Dark' ? colors.dark : colors.light};`,
  )

const declarationsOf = (theme: Theme, own: OwnRoles, mode: Mode): string =>
  pipe(
    [...cssVariablesOf(theme, mode), ...ownVariablesOf(own, mode)],
    Array.map(declaration => `  ${declaration}`),
    Array.join('\n'),
  )

/** The attribute a DOM painter sets while the Model's contrast is More. */
export const contrastAttribute = 'data-fk-contrast'

const moreColorOf = (colors: RoleColors, mode: Mode): string | undefined =>
  mode === 'Dark' ? colors.darkMore : colors.lightMore

// NOTE: only the roles that are stronger under More Contrast are declared
// again, so a theme that names none writes no contrast rules at all.
const moreDeclarationsOf = (
  theme: Theme,
  own: OwnRoles,
  mode: Mode,
): ReadonlyArray<string> => [
  ...Array.flatMap(Role.literals, role => {
    const maybeColor = moreColorOf(theme[role], mode)
    return maybeColor === undefined
      ? []
      : [`  ${cssVariableOf(role)}: ${maybeColor};`]
  }),
  ...Array.flatMap(Record.toEntries(own), ([name, colors]) => {
    const maybeColor = moreColorOf(colors, mode)
    return maybeColor === undefined
      ? []
      : [`  ${ownCssVariableOf(name)}: ${maybeColor};`]
  }),
]

const moreBlockOf = (
  selector: string,
  declarations: ReadonlyArray<string>,
): ReadonlyArray<string> =>
  Array.isReadonlyArrayNonEmpty(declarations)
    ? [`:where(${selector}) {\n${Array.join(declarations, '\n')}\n}`]
    : []

/**
 * The stylesheet that declares a theme for the DOM: every role as a CSS
 * variable, light by default, and dark on and under an element whose
 * `data-fk-mode` is `Dark`. The DOM painter sets that attribute from the
 * mode in the Model; nothing here asks the system which mode it is in. A
 * domain's own roles, when given, are declared beside the library's.
 * Roles that are stronger under More Contrast are declared again on an
 * element whose `data-fk-contrast` is `More`, light and dark apart.
 *
 * @example
 * ```typescript
 * themeStylesheet(defaultTheme)
 * // ':where(:root) {\n  --fk-page-ground: #ffffff;\n  …\n}\n\n:where([data-fk-mode="Dark"]) {\n  --fk-page-ground: #0b0d0c;\n  …\n}'
 * ```
 */
export const themeStylesheet = (theme: Theme, own: OwnRoles = {}): string =>
  [
    `:where(:root) {\n${declarationsOf(theme, own, 'Light')}\n}`,
    `:where([${modeAttribute}="Light"]) {\n${declarationsOf(theme, own, 'Light')}\n}`,
    `:where([${modeAttribute}="Dark"]) {\n${declarationsOf(theme, own, 'Dark')}\n}`,
    ...moreBlockOf(
      `[${contrastAttribute}="More"]:not([${modeAttribute}="Dark"])`,
      moreDeclarationsOf(theme, own, 'Light'),
    ),
    ...moreBlockOf(
      `[${modeAttribute}="Dark"][${contrastAttribute}="More"]`,
      moreDeclarationsOf(theme, own, 'Dark'),
    ),
  ].join('\n\n')
