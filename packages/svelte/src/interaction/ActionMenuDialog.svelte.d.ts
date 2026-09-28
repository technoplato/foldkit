import type { Component } from 'svelte'

import type { ReactiveProgram } from './reactive.js'

/**
 * The action menu as an accessible combo box: a filter input and a listbox
 * of Catalog rows over a dismissing backdrop. It renders nothing while the
 * Model presents no menu. Keys are routed by `listenToDocumentKeys`; the
 * input only carries typing.
 *
 * @example
 * ```svelte
 * <ActionMenuDialog program={counter} />
 * ```
 */
declare const ActionMenuDialog: Component<
  Readonly<{
    program: ReactiveProgram<unknown, never>
    class?: string
  }>
>
export default ActionMenuDialog
