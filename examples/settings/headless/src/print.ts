import { type UiNode, renderScreen } from 'foldkit/renderers'

/** Paints a Program screen tree as plain text. */
export const printSettings = (node: UiNode): string => renderScreen(node)
