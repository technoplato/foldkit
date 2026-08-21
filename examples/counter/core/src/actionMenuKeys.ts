import { Array, Option } from 'effect'
import { Program } from 'foldkit'

import { type AppMessage } from './app.js'
import { type ListedAction } from './listActions.js'
import { type Action, type Message, actions } from './message.js'
import { type Model } from './model.js'

/** Token to flash when a row is chosen. Hosts paint this. Core does not. */
export const chosenMenuTokenOf = (
  message: AppMessage,
): Option.Option<string> => {
  if (message._tag === 'ActionCommandMenuSelectionMade') {
    return Option.some(message.token)
  }
  const maybeAction = Array.findFirst(
    actions,
    action => action()._tag === message._tag,
  )
  if (Option.isNone(maybeAction)) {
    return Option.none()
  }
  return Array.head(maybeAction.value.tokens ?? [])
}

/** Browser or terminal key facts a Client can map to App Messages. */
export type ActionMenuKeyInput = Readonly<{
  key: string
  metaKey: boolean
  ctrlKey: boolean
}>

const focusedToken = (
  menu: Program.ActionMenuModelValue,
  rows: ReadonlyArray<ListedAction>,
): string | undefined => {
  if (menu._tag === 'Closed') {
    return undefined
  }
  const visible = Program.filterByQuery(rows, menu.maybeQuery)
  if (visible._tag === 'Empty') {
    return undefined
  }
  const maybeRow = Array.get(visible.rows, menu.focus)
  if (Option.isNone(maybeRow)) {
    return undefined
  }
  return maybeRow.value.token
}

const currentQuery = (menu: Program.ActionMenuModelValue): string => {
  if (menu._tag === 'Closed') {
    return ''
  }
  return Option.getOrElse(menu.maybeQuery, () => '')
}

const keyAliases = (key: string): ReadonlyArray<string> => {
  const lower = key.toLowerCase()
  if (lower === key) {
    return [key]
  }
  return [key, lower]
}

const actionKeysOf = (action: Action): ReadonlyArray<string> =>
  action.keys ?? []

const isDeclaredActionKey = (key: string): boolean =>
  Array.some(actions, action =>
    Array.some(keyAliases(key), alias =>
      Array.contains(actionKeysOf(action), alias),
    ),
  )

const actionForKey = (key: string): Action | undefined => {
  const maybeAction = Array.findFirst(actions, action =>
    Array.some(keyAliases(key), alias =>
      Array.contains(actionKeysOf(action), alias),
    ),
  )
  if (Option.isNone(maybeAction)) {
    return undefined
  }
  return maybeAction.value
}

/**
 * Maps a key to a product Action from constructor `keys` metadata.
 * Hidden Actions do not send.
 */
export const productMessageFromKey = (
  key: string,
  model: Model,
): Message | undefined => {
  const action = actionForKey(key)
  if (action === undefined) {
    return undefined
  }
  if (!action.valid(model, {})) {
    return undefined
  }
  return action()
}

const isOpenShortcut = (input: ActionMenuKeyInput): boolean => {
  const key = input.key
  return (
    ((input.metaKey || input.ctrlKey) && (key === 'k' || key === 'K')) ||
    key === '?'
  )
}

const isPrintableQueryKey = (key: string): boolean => {
  if (key.length !== 1) {
    return false
  }
  if (key === '?' || key === 'Escape') {
    return false
  }
  return !isDeclaredActionKey(key)
}

/**
 * Maps a Client key to an App Message.
 * Action `keys` fire while Closed and while Open.
 * Other printable keys filter the Open catalog.
 */
export const actionMenuMessageFromKey = (
  input: ActionMenuKeyInput,
  menu: Program.ActionMenuModelValue,
  rows: ReadonlyArray<ListedAction>,
  model?: Model,
): AppMessage | undefined => {
  if (isOpenShortcut(input)) {
    return Program.ActionMenuCommandTriggered()
  }
  if (input.key === 'Escape' || input.key === 'Esc' || input.key === 'escape') {
    return Program.ActionMenuDismissed()
  }
  if (model !== undefined) {
    const product = productMessageFromKey(input.key, model)
    if (product !== undefined) {
      return product
    }
  }
  if (menu._tag === 'Closed') {
    return undefined
  }
  if (input.key === 'ArrowUp' || input.key === 'up') {
    return Program.ActionMenuFocusMoved({ direction: 'Up' })
  }
  if (input.key === 'ArrowDown' || input.key === 'down') {
    return Program.ActionMenuFocusMoved({ direction: 'Down' })
  }
  if (isActionMenuEnterKey(input.key)) {
    const token = focusedToken(menu, rows)
    if (token === undefined) {
      return undefined
    }
    return Program.ActionCommandMenuSelectionMade({ token })
  }
  if (input.key === 'Backspace') {
    const query = currentQuery(menu)
    if (query === '') {
      return undefined
    }
    return Program.ActionMenuQueryChanged({ query: query.slice(0, -1) })
  }
  if (isPrintableQueryKey(input.key)) {
    return Program.ActionMenuQueryChanged({
      query: `${currentQuery(menu)}${input.key}`,
    })
  }
  return undefined
}

/** True for terminal and browser Enter, including `\r` from Effect Terminal. */
export const isActionMenuEnterKey = (key: string): boolean => {
  const normalized = key.toLowerCase()
  return (
    normalized === 'enter' ||
    normalized === 'return' ||
    key === '\r' ||
    key === '\n'
  )
}

/**
 * DOM `document` keydown is valid on web. React Native Expo has a `window`
 * polyfill but must not attach `keydown`.
 */
export const canAttachDomKeydown = (): boolean => {
  if (typeof window === 'undefined') {
    return false
  }
  if (typeof window.addEventListener !== 'function') {
    return false
  }
  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
    return false
  }
  return typeof document !== 'undefined'
}
