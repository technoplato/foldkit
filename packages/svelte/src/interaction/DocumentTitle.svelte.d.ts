import type { Component } from 'svelte'

import type { ReactiveProgram } from './reactive.js'

/**
 * Keeps the tab's title on the Program's screen and names the Host it was
 * started on, `Session | Svelte`. While the Program is Starting, the title
 * is its own description, `Starting Counter… | Svelte`. Mount it outside
 * any status branch so it titles every state.
 *
 * @example
 * ```svelte
 * <DocumentTitle program={counter} />
 * ```
 */
declare const DocumentTitle: Component<
  Readonly<{ program: ReactiveProgram<unknown, never> }>
>
export default DocumentTitle
