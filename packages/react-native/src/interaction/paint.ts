import { Array } from 'effect'
import type { BoxNode, ButtonNode, UiNode } from 'foldkit/renderers'
import type { TextStyle, ViewStyle } from 'react-native'

import type { Look } from './look.js'

/**
 * Extra style per node kind, merged over the default for that kind, which
 * comes from the look. `ButtonLabel` styles the text inside a Button. An
 * app needs none of it to match the other painters.
 *
 * @example
 * ```typescript
 * const styles: PaintStyles = { Button: { borderRadius: 8 } }
 * ```
 */
export type PaintStyles = Readonly<{
  Text?: TextStyle
  Button?: ViewStyle
  ButtonLabel?: TextStyle
  TextInput?: TextStyle
  Spacer?: ViewStyle
  Row?: ViewStyle
  Column?: ViewStyle
  Box?: ViewStyle
  Progress?: ViewStyle
  List?: ViewStyle
  Seek?: ViewStyle
  Transcript?: ViewStyle
  DeviceShell?: ViewStyle
}>

/**
 * How a painted tree reports presses and links, the look it is told to
 * draw with, and the styles it merges. `platformActions` are Actions the
 * platform already offers where the tree is shown, such as going back
 * under a native header: a Button that only repeats one is left out.
 */
export type PaintHandlers = Readonly<{
  onPress: (button: ButtonNode) => void
  onInput?: (token: string, value: string) => void
  onLink?: (href: string) => void
  look?: Look
  styles?: PaintStyles
  platformActions?: ReadonlyArray<string>
}>

/** Everything one paint of a tree reads, resolved from the handlers. */
export type Paint = Readonly<{
  look: Look
  styles: PaintStyles
  onPress: (button: ButtonNode) => void
  onInput: ((token: string, value: string) => void) | undefined
  onLink: (href: string) => void
  platformActions: ReadonlyArray<string>
  isCentered: boolean
}>

/** A press of an Action that is not a Button's own, such as a word's. */
export const pressOf = (action: string, label: string): ButtonNode => ({
  _tag: 'Button',
  label,
  action,
})

// PARTS

/**
 * A screen in the parts a phone lays out apart: the body, which scrolls,
 * and the docks, which stay in view at the bottom edge.
 */
export type ScreenParts = Readonly<{
  maybeBody: UiNode | undefined
  docks: ReadonlyArray<BoxNode>
}>

type Lifted = Readonly<{
  kept: ReadonlyArray<UiNode>
  docks: ReadonlyArray<BoxNode>
}>

const isDock = (node: UiNode): node is BoxNode =>
  node._tag === 'Box' && node.isDock === true

const liftAll = (children: ReadonlyArray<UiNode>): Lifted =>
  Array.reduce(children, { kept: [], docks: [] }, (lifted: Lifted, child) => {
    const part = liftDocks(child)
    return {
      kept: [...lifted.kept, ...Array.fromNullishOr(part.maybeBody)],
      docks: [...lifted.docks, ...part.docks],
    }
  })

const liftDocks = (node: UiNode): ScreenParts => {
  if (
    node._tag !== 'Column' &&
    node._tag !== 'Row' &&
    node._tag !== 'Box' &&
    node._tag !== 'DeviceShell'
  ) {
    return { maybeBody: node, docks: [] }
  } else if (isDock(node)) {
    return { maybeBody: undefined, docks: [node] }
  } else {
    const lifted = liftAll(node.children)
    return {
      maybeBody: { ...node, children: lifted.kept },
      docks: lifted.docks,
    }
  }
}

/**
 * Splits a screen into its scrolling body and its docks. A dock is a Box
 * a Program marks `isDock`, such as a player's bar: on a phone it stays
 * at the bottom edge while the body scrolls beneath it.
 *
 * @example
 * ```typescript
 * screenPartsOf(Column({}, Text('Library'), Box({ isDock: true }, tabs)))
 * // { maybeBody: Column(Text('Library')), docks: [Box(tabs)] }
 * ```
 */
export const screenPartsOf = (node: UiNode): ScreenParts => liftDocks(node)

/** True when a tree holds a node of one kind, such as a Transcript. */
export const hasNodeOf = (node: UiNode, tag: UiNode['_tag']): boolean => {
  if (node._tag === tag) {
    return true
  } else if (
    node._tag === 'Column' ||
    node._tag === 'Row' ||
    node._tag === 'Box' ||
    node._tag === 'DeviceShell'
  ) {
    return Array.some(node.children, child => hasNodeOf(child, tag))
  } else {
    return false
  }
}
