import { Array, Option } from 'effect'

import { type CarrierPlan, layersOf } from './carrier.js'
import type { EntryView } from './declaration.js'
import type { PresentationStyle } from './structure.js'

// FRAME

/**
 * One painted entry: its key, its identity, how it is presented, and its
 * view. A painter keys the layer by `identity`, so a page whose address
 * follows a moving place keeps its DOM, and reads its view by `key`.
 */
export type FrameLayer = Readonly<{
  key: string
  identity: string
  maybeStyle: Option.Option<PresentationStyle>
  view: EntryView
}>

/**
 * The word a painter marks a layer with, so a stylesheet can place it: the
 * style's tag, or `Root` for the entry at the bottom.
 *
 * @example
 * ```typescript
 * styleTagOf(menuLayer) // 'Dialog'
 * styleTagOf(rootLayer) // 'Root'
 * ```
 */
export const styleTagOf = (
  layer: Readonly<{ maybeStyle: Option.Option<PresentationStyle> }>,
): string =>
  Option.match(layer.maybeStyle, {
    onNone: () => 'Root',
    onSome: style => style._tag,
  })

/**
 * Everything a host with one surface paints: where the Program is, the
 * title of the topmost entry that declares one, the base screen, and each
 * entry presented over it, bottom first.
 *
 * @example
 * ```typescript
 * frameOf(bound)
 * // Some({ uri: '/counter/history/menu?menu.q=re',
 * //   base: { key: '/counter/history', view: Screen(history page) },
 * //   overlays: [{ key: '/counter/history/menu', view: Menu(rows) }] })
 * ```
 */
export type Frame = Readonly<{
  uri: string
  maybeTitle: Option.Option<string>
  base: FrameLayer
  overlays: ReadonlyArray<FrameLayer>
}>

/** What {@link frameOf} reads: a bound Program satisfies it. */
export type FrameSource = Readonly<{
  navigation: () => Option.Option<CarrierPlan<unknown>>
  viewAt: (key: string) => Option.Option<EntryView>
}>

/**
 * The frame a single-surface host paints now. None until the Program is
 * Ready, for a Program without a URI, or when the base entry has no view.
 * An overlay without a view is left out.
 *
 * @example
 * ```typescript
 * // the plan is /counter/history/menu?menu.q=re
 * frameOf(bound)
 * // Some({ uri: '/counter/history/menu?menu.q=re', base: History page, overlays: [menu] })
 * ```
 */
export const frameOf = (source: FrameSource): Option.Option<Frame> =>
  Option.flatMap(source.navigation(), plan => {
    const { base, overlays } = layersOf(plan)
    const layerOf = (entry: typeof base): Option.Option<FrameLayer> =>
      Option.map(source.viewAt(entry.key), view => ({
        key: entry.key,
        identity: entry.identity,
        maybeStyle: entry.maybeStyle,
        view,
      }))
    return Option.map(layerOf(base), baseLayer => ({
      uri: plan.uri,
      maybeTitle: Array.last(
        Array.getSomes(Array.map(plan.entries, entry => entry.maybeTitle)),
      ),
      base: baseLayer,
      overlays: Array.getSomes(Array.map(overlays, layerOf)),
    }))
  })

/**
 * A window title: the screen's title, then which app shows it, with the
 * spaced pipe every Foldkit title uses.
 *
 * @example
 * ```typescript
 * documentTitleOf(Option.some('Session'), 'Svelte') // 'Session | Svelte'
 * documentTitleOf(Option.none(), 'OpenTUI') // 'OpenTUI'
 * ```
 */
export const documentTitleOf = (
  maybeTitle: Option.Option<string>,
  appLabel: string,
): string =>
  Option.match(maybeTitle, {
    onNone: () => appLabel,
    onSome: title => `${title} | ${appLabel}`,
  })
