import { Array, Option } from 'effect'

import { type CarrierPlan, layersOf } from './carrier.js'
import type { EntryView } from './declaration.js'
import type { PresentationStyle } from './structure.js'

// FRAME

/** One painted entry: its key, how it is presented, and its view. */
export type FrameLayer = Readonly<{
  key: string
  maybeStyle: Option.Option<PresentationStyle>
  view: EntryView
}>

/**
 * Everything a host with one surface paints: where the Program is, the
 * title of the topmost entry that declares one, the base screen, and each
 * entry presented over it, bottom first.
 *
 * @example
 * ```typescript
 * frameOf(bound)
 * // Some({ uri: '/counter/session/menu?menu.q=re',
 * //   base: { key: '/counter/session', view: Screen(session page) },
 * //   overlays: [{ key: '/counter/session/menu', view: Menu(rows) }] })
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
 * // the plan is /counter/session/menu?menu.q=re
 * frameOf(bound)
 * // Some({ uri: '/counter/session/menu?menu.q=re', base: Session page, overlays: [menu] })
 * ```
 */
export const frameOf = (source: FrameSource): Option.Option<Frame> =>
  Option.flatMap(source.navigation(), plan => {
    const { base, overlays } = layersOf(plan)
    const layerOf = (entry: typeof base): Option.Option<FrameLayer> =>
      Option.map(source.viewAt(entry.key), view => ({
        key: entry.key,
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
