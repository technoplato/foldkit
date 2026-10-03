import type { Component } from 'svelte'

import type { ReactiveProgram } from './reactive.js'

/**
 * A button that opens the Program's action menu, labeled from the
 * Program: `Actions (⌘K)` on a Mac and `Actions (Ctrl+K)` elsewhere. It
 * renders nothing for a Program without a menu.
 *
 * @example
 * ```svelte
 * <ActionMenuButton program={counter} />
 * ```
 */
declare const ActionMenuButton: Component<
  Readonly<{
    program: ReactiveProgram<unknown, never>
    class?: string
  }>
>
export default ActionMenuButton
