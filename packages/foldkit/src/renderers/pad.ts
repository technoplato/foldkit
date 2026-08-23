import { Array } from 'effect'

import { buttonsOf } from './query.js'
import type { UiNode } from './types.js'

/** Action metadata a pad can read. Token and keys only. */
export type PadAction = Readonly<{
  token: string
  keys: ReadonlyArray<string>
}>

/** A keyboard key that can be pressed because it carries a token. */
export type PressableKey = Readonly<{
  key: string
  token: string
}>

/** A screen Button that can be pressed because it carries a token. */
export type PressableButton = Readonly<{
  token: string
  label: string
}>

/** Keys and Buttons derived from the current screen tree. */
export type MobilePad = Readonly<{
  keys: ReadonlyArray<PressableKey>
  buttons: ReadonlyArray<PressableButton>
}>

/**
 * Builds the pad from the screen tree and Action metadata.
 * A Button absent from the tree is absent from the pad. A key with no
 * token cannot appear.
 */
export const padOf = (
  screen: UiNode,
  actions: ReadonlyArray<PadAction>,
): MobilePad => {
  const buttons = Array.flatMap(buttonsOf(screen), button => {
    if (
      button.token === undefined ||
      button.token === '' ||
      button.disabled === true
    ) {
      return []
    }
    return [{ token: button.token, label: button.label }]
  })
  const tokensOnScreen = Array.map(buttons, button => button.token)
  const keys = Array.flatMap(actions, action => {
    if (!Array.contains(tokensOnScreen, action.token)) {
      return []
    }
    return Array.flatMap(action.keys, key => {
      if (key === '' || action.token === '') {
        return []
      }
      return [{ key, token: action.token }]
    })
  })
  return { keys, buttons }
}
