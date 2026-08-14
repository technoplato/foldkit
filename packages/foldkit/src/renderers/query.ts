import { Array, Match as M } from 'effect'

import type { ButtonNode, TextNode, UiNode } from './types.js'

/** Reads every Text node, depth first. */
export const textsOf = (node: UiNode): ReadonlyArray<TextNode> =>
  M.value(node).pipe(
    M.withReturnType<ReadonlyArray<TextNode>>(),
    M.tagsExhaustive({
      Text: text => [text],
      Button: () => [],
      TextInput: () => [],
      Spacer: () => [],
      Row: row => Array.flatMap(row.children, textsOf),
      Column: column => Array.flatMap(column.children, textsOf),
      Box: box => Array.flatMap(box.children, textsOf),
      DeviceShell: shell => Array.flatMap(shell.children, textsOf),
    }),
  )

/** Reads every Button node, depth first. */
export const buttonsOf = (node: UiNode): ReadonlyArray<ButtonNode> =>
  M.value(node).pipe(
    M.withReturnType<ReadonlyArray<ButtonNode>>(),
    M.tagsExhaustive({
      Text: () => [],
      Button: button => [button],
      TextInput: () => [],
      Spacer: () => [],
      Row: row => Array.flatMap(row.children, buttonsOf),
      Column: column => Array.flatMap(column.children, buttonsOf),
      Box: box => Array.flatMap(box.children, buttonsOf),
      DeviceShell: shell => Array.flatMap(shell.children, buttonsOf),
    }),
  )
