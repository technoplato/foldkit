import { Effect, Layer, Queue, Stream } from 'effect'
import { type Contrast, type Mode, SystemAppearance } from 'foldkit/theme'
import { AccessibilityInfo, Appearance, Platform } from 'react-native'

// SYSTEM

/**
 * The mode a device's color scheme means. A device that names none is
 * taken to be in light.
 *
 * @example
 * ```typescript
 * modeOfScheme('dark') // 'Dark'
 * modeOfScheme(null) // 'Light'
 * ```
 */
export const modeOfScheme = (scheme: string | null | undefined): Mode =>
  scheme === 'dark' ? 'Dark' : 'Light'

/**
 * The contrast a device's setting asks for: more when Increase Contrast,
 * or Android's high contrast text, is on.
 *
 * @example
 * ```typescript
 * contrastOfSetting(true) // 'More'
 * ```
 */
export const contrastOfSetting = (isMoreContrastOn: boolean): Contrast =>
  isMoreContrastOn ? 'More' : 'Standard'

const modes: Stream.Stream<Mode> = Stream.callback<Mode>(queue =>
  Effect.acquireRelease(
    Effect.sync(() => {
      Queue.offerUnsafe(queue, modeOfScheme(Appearance.getColorScheme()))
      return Appearance.addChangeListener(({ colorScheme }) => {
        Queue.offerUnsafe(queue, modeOfScheme(colorScheme))
      })
    }),
    subscription =>
      Effect.sync(() => {
        subscription.remove()
      }),
  ),
)

const readIsMoreContrastOn = (): Promise<boolean> =>
  Platform.OS === 'ios'
    ? AccessibilityInfo.isDarkerSystemColorsEnabled()
    : AccessibilityInfo.isHighTextContrastEnabled()

const contrastChange =
  Platform.OS === 'ios'
    ? 'darkerSystemColorsChanged'
    : 'highTextContrastChanged'

const contrasts: Stream.Stream<Contrast> = Stream.callback<Contrast>(queue =>
  Effect.acquireRelease(
    Effect.sync(() => {
      void readIsMoreContrastOn().then(isOn => {
        Queue.offerUnsafe(queue, contrastOfSetting(isOn))
      })
      return AccessibilityInfo.addEventListener(contrastChange, isOn => {
        Queue.offerUnsafe(queue, contrastOfSetting(isOn))
      })
    }),
    subscription =>
      Effect.sync(() => {
        subscription.remove()
      }),
  ),
)

/**
 * A phone's report of the system's appearance: its mode now, then each
 * change, and whether it asks for more contrast. This host adapter is the
 * only code in a React Native Client that asks the system; it hands the
 * answers to the Program as facts, `ObservedSystemMode` and
 * `ObservedSystemContrast`, and every painter is then told.
 *
 * @example
 * ```typescript
 * Layer.mergeAll(resources, nativeSystemAppearance)
 * ```
 */
export const nativeSystemAppearance = Layer.succeed(SystemAppearance, {
  modes,
  contrasts,
})
