import { layoutTree } from './layout.js'
import { paintAscii } from './paint.js'
import type { AsciiFrame, UiNode } from './types.js'

/** Render a host-neutral UI tree to ASCII lines + hotspots. */
export function renderAscii(root: UiNode): AsciiFrame {
  const laid = layoutTree(root, 0, 0)
  return paintAscii(laid)
}

/** Multi-node canvas: each product tree → one frame. */
export function renderAsciiForest(
  nodes: ReadonlyArray<{ uri: string; tree: UiNode }>,
): ReadonlyArray<{ uri: string; frame: AsciiFrame }> {
  return nodes.map(({ uri, tree }) => ({ uri, frame: renderAscii(tree) }))
}
