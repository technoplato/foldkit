import type { Component } from 'svelte'

import type { PaintClassNames } from './paint.js'
import type { ReactiveProgram } from './reactive.js'

/**
 * Paints the Program's navigation frame: the base screen, each screen
 * presented over it in a dialog whose `data-style` names its
 * presentation, and the action menu. Choosing `Open session settings`
 * shows the Session page. A Program without a URI paints its screen and
 * its menu instead. With `appLabel`, the tab's title follows the screen
 * and names the app, `Session | Svelte`.
 *
 * @example
 * ```svelte
 * <NavigationFrame program={counter} />
 * ```
 */
declare const NavigationFrame: Component<
  Readonly<{
    program: ReactiveProgram<unknown, never>
    classNames?: PaintClassNames
    appLabel?: string
  }>
>
export default NavigationFrame
