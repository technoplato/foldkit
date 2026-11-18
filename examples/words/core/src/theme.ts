import { Theme } from 'foldkit'

// THEME

/**
 * The words site's theme: the library's theme with the site's own color
 * in each role it uses, light and dark. They are the colors the site
 * named for itself before (canvas, surface, label, tint, the red of
 * Record, the highlight on the spoken word, and the rest), so nothing
 * looks different; what changes is who decides the mode. A role the site
 * does not use keeps the library's color.
 */
export const wordsTheme: Theme.Theme = Theme.withRoles(Theme.defaultTheme, {
  PageGround: { light: '#f2f2f7', dark: '#000000' },
  Surface: { light: '#ffffff', dark: '#1c1c1e' },
  RaisedSurface: { light: '#ffffff', dark: '#2c2c2e' },
  Field: { light: 'rgb(120 120 128 / 0.12)', dark: 'rgb(120 120 128 / 0.24)' },
  FieldStrong: {
    light: 'rgb(120 120 128 / 0.2)',
    dark: 'rgb(120 120 128 / 0.36)',
  },
  Text: { light: '#1d1d1f', dark: '#f5f5f7' },
  QuietText: { light: 'rgb(60 60 67 / 0.76)', dark: 'rgb(235 235 245 / 0.72)' },
  FaintText: { light: 'rgb(60 60 67 / 0.5)', dark: 'rgb(235 235 245 / 0.46)' },
  Rule: { light: 'rgb(60 60 67 / 0.14)', dark: 'rgb(84 84 88 / 0.6)' },
  Danger: { light: '#ff3b30', dark: '#ff453a' },
  DangerStrong: { light: '#d70015', dark: '#ff8a80' },
  DangerFill: { light: '#d70015', dark: '#d70015' },
  DangerSoft: { light: 'rgb(255 59 48 / 0.12)', dark: 'rgb(255 69 58 / 0.2)' },
  Accent: { light: '#0058b0', dark: '#4da3ff' },
  Link: { light: '#0058b0', dark: '#4da3ff' },
  AccentSoft: { light: 'rgb(0 88 176 / 0.1)', dark: 'rgb(77 163 255 / 0.18)' },
  Positive: { light: '#1f7a36', dark: '#30d158' },
  PositiveSoft: {
    light: 'rgb(52 199 89 / 0.16)',
    dark: 'rgb(48 209 88 / 0.18)',
  },
  Warning: { light: '#b83200', dark: '#ff9f0a' },
  WarningSoft: {
    light: 'rgb(255 149 0 / 0.16)',
    dark: 'rgb(255 159 10 / 0.18)',
  },
  ReadingCurrentWordGround: {
    light: 'rgb(255 204 0 / 0.42)',
    dark: 'rgb(255 214 10 / 0.32)',
  },
  Focus: { light: 'rgb(255 149 0 / 0.55)', dark: 'rgb(255 159 10 / 0.6)' },
  Selected: { light: '#ffffff', dark: '#636366' },
  Veil: { light: 'rgb(255 255 255 / 0.9)', dark: 'rgb(44 44 46 / 0.88)' },
  BarGround: { light: 'rgb(242 242 247 / 0.92)', dark: 'rgb(0 0 0 / 0.88)' },
  Shadow: { light: 'rgb(0 0 0 / 0.14)', dark: 'rgb(0 0 0 / 0.5)' },
  // NOTE: the text on a filled control, such as the match a search is on,
  // is white in both modes here.
  ButtonLabel: { light: '#ffffff', dark: '#ffffff' },
})

/**
 * The roles that are Scribe's own: the badge beside a recording's title
 * while it records, while it is paused, and while it plays, and the tile
 * behind a device's icon.
 */
export const wordsOwnRoles: Theme.OwnRoles = Theme.withOwnRoles({
  BadgeRecording: { light: '#b50012', dark: '#ffa198' },
  BadgePaused: { light: '#a32c00', dark: '#ffb340' },
  BadgePlaying: { light: '#0058b0', dark: '#8cc4ff' },
  DeviceTile: { light: '#1c1c1e', dark: '#48484a' },
})

/**
 * The stylesheet that declares the words theme: every role as a variable,
 * light by default and dark on and under an element whose mode the
 * Program says is dark. Nothing in it asks the system.
 */
export const wordsStylesheet: string = Theme.themeStylesheet(
  wordsTheme,
  wordsOwnRoles,
)
