import { layoutTree } from './layout.js'
import { paintAscii } from './paint.js'
import type { AsciiFrame, UiNode } from './types.js'

/** Renders a host-neutral UI tree to ASCII lines and hotspots. */
export const renderAscii = (root: UiNode, availableW = 80): AsciiFrame =>
  paintAscii(layoutTree(root, 0, 0, availableW))

/** Joins painted lines into one screen. */
export const renderScreen = (root: UiNode, availableW = 80): string =>
  renderAscii(root, availableW).lines.join('\n')
