import { Interaction } from 'foldkit'
import {
  type Contrast,
  type Mode,
  type Role,
  type Theme,
  defaultTheme,
  roleColorsOf,
} from 'foldkit/theme'
import type { DimensionValue, ViewStyle } from 'react-native'

// LOOK

/**
 * What a painter draws with: each role's color in the mode and contrast
 * the Program resolved, and the sizes every graphical painter shares. A
 * painter never asks the system which mode it is in; it is told.
 */
export type Look = Readonly<{
  mode: Mode
  contrast: Contrast
  colors: Readonly<Record<Role, string>>
  sizes: Interaction.ScreenLook
}>

/**
 * The look for one mode and contrast of a theme.
 *
 * @example
 * ```typescript
 * lookOf('Dark').colors.Text // the theme's dark Text
 * lookOf('Light', 'More').colors.QuietText // its stronger color, where it names one
 * ```
 */
export const lookOf = (
  mode: Mode = 'Light',
  contrast: Contrast = 'Standard',
  theme: Theme = defaultTheme,
): Look => ({
  mode,
  contrast,
  colors: roleColorsOf(theme, mode, contrast),
  sizes: Interaction.screenLook,
})

/** The look a tree is painted with when no host says otherwise: light. */
export const lightLook: Look = lookOf()

const gradientStart = 'linear-gradient('

const noGround = 'transparent'

/**
 * A role's ground as a style. A theme may give a ground as a color, as a
 * gradient written the way a stylesheet writes one, or as nothing at all.
 *
 * @example
 * ```typescript
 * groundStyleOf(look.colors.ReadingGround)
 * ```
 */
export const groundStyleOf = (ground: string): ViewStyle => {
  if (ground === noGround) {
    return {}
  } else if (ground.startsWith(gradientStart)) {
    return { experimental_backgroundImage: ground }
  } else {
    return { backgroundColor: ground }
  }
}

/**
 * A share of a width as a style value.
 *
 * @example
 * ```typescript
 * percentOf(0.25) // '25%'
 * ```
 */
export const percentOf = (fraction: number): DimensionValue =>
  `${Math.min(1, Math.max(0, fraction)) * 100}%`
