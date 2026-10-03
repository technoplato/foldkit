import type { Component, Snippet } from 'svelte'

import type { ReactiveProgram } from './reactive.js'

/**
 * Paints its children once the Program is Ready, and the Program's own
 * description while it is Starting or Failed, so a host writes no status
 * text: `Starting Counter…`, then the count.
 *
 * @example
 * ```svelte
 * <WhenReady program={counter}>
 *   <NavigationFrame program={counter} />
 * </WhenReady>
 * ```
 */
declare const WhenReady: Component<
  Readonly<{
    program: ReactiveProgram<unknown, never>
    children: Snippet
  }>
>
export default WhenReady
