import type { Component } from 'svelte'

import type { PaintClassNames } from './paint.js'
import type { ReactiveProgram } from './reactive.js'

/**
 * Paints the Program's navigation frame: the base screen, each screen
 * presented over it in a dialog whose `data-style` names its
 * presentation, and the action menu. Choosing `Open session settings`
 * presents the Session Sheet. A Program without a URI paints its screen and
 * its menu instead. Pair it with `DocumentTitle` to title the tab.
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
  }>
>
export default NavigationFrame
