import type { ButtonNode, UiNode } from 'foldkit/renderers'
import type { Component } from 'svelte'

import type { PaintClassNames } from './paint.js'

/**
 * Paints a Program screen tree as Svelte markup with fk-* classes. A Button
 * press reports the whole node, so a Client sends its Catalog `action`. A
 * disabled Button carries its `because` sentence as the title.
 *
 * @example
 * ```svelte
 * <PaintTree node={counterScreen({ count: 3 })} onPress={press} />
 * ```
 */
declare const PaintTree: Component<
  Readonly<{
    node: UiNode
    onPress: (button: ButtonNode) => void
    classNames?: PaintClassNames
  }>
>
export default PaintTree
