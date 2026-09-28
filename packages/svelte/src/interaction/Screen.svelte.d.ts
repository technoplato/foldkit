import type { Component } from 'svelte'

import type { PaintClassNames } from './paint.js'
import type { ReactiveProgram } from './reactive.js'

/**
 * Paints a reactive Program's screen tree and repaints on every Model
 * change. A Button press sends its Catalog Action, so the screen needs no
 * token table.
 *
 * @example
 * ```svelte
 * <Screen program={counter} classNames={{ Text: 'text-7xl' }} />
 * ```
 */
declare const Screen: Component<
  Readonly<{
    program: ReactiveProgram<unknown, never>
    classNames?: PaintClassNames
  }>
>
export default Screen
