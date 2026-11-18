import { Array, Context, Effect, Layer, Option } from 'effect'
import { Theme } from 'foldkit'

import type { Model } from './model.js'

// APPEARANCE

/**
 * Where the look a listener chose is kept on this device, so it is the
 * same after a reload. It is per device on purpose: a phone in a dark
 * room and a desk in daylight each keep their own. The default keeps
 * nothing, so a host that provides none simply follows the system.
 */
export const AppearanceStore = Context.Reference<
  Readonly<{
    read: Effect.Effect<Option.Option<Theme.Appearance>>
    keep: (appearance: Theme.Appearance) => Effect.Effect<void>
  }>
>('words-core-example/AppearanceStore', {
  defaultValue: () => ({
    read: Effect.succeed(Option.none()),
    keep: () => Effect.void,
  }),
})

/**
 * A store that keeps the choice in memory, for tests and previews.
 *
 * @example
 * ```ts
 * makeMemoryAppearanceStore(Option.some('Dark'))
 * ```
 */
export const makeMemoryAppearanceStore = (
  initial: Option.Option<Theme.Appearance>,
) => {
  const kept = { maybeAppearance: initial }
  return Layer.succeed(AppearanceStore, {
    read: Effect.sync(() => kept.maybeAppearance),
    keep: appearance =>
      Effect.sync(() => {
        kept.maybeAppearance = Option.some(appearance)
      }),
  })
}

/**
 * The mode the page is painted in: the listener's choice, or the
 * system's mode when the choice is to follow it. From the Model alone.
 *
 * @example
 * ```ts
 * modeOf(model) // 'Dark'
 * ```
 */
export const modeOf = (model: Model): Theme.Mode =>
  Theme.modeOfState(model.appearance)

/**
 * The contrast the page is painted with: the usual, or more where the
 * system on this device asks for it. From the Model alone.
 */
export const contrastOf = (model: Model): Theme.Contrast =>
  Theme.contrastOfState(model.appearance)

/** One look a listener can choose, in words, and whether it is in use. */
export type AppearanceChoice = Readonly<{
  appearance: Theme.Appearance
  label: string
  isChosen: boolean
}>

const labelOf = (appearance: Theme.Appearance): string =>
  appearance === 'System' ? 'Follow the System' : appearance

/**
 * The three looks, for a control to offer: follow the system, light, and
 * dark, with the one in use marked.
 *
 * @example
 * ```ts
 * appearanceChoicesOf(model)
 * // [{ appearance: 'System', label: 'Follow the System', isChosen: true }, …]
 * ```
 */
export const appearanceChoicesOf = (
  model: Model,
): ReadonlyArray<AppearanceChoice> =>
  Array.map(Theme.Appearance.literals, appearance => ({
    appearance,
    label: labelOf(appearance),
    isChosen: model.appearance.appearance === appearance,
  }))
