import { Array, Option } from 'effect'

import { clearEcho, listenForHints, showEcho } from './documentHints.js'
import {
  type Echo,
  type KeyInput,
  type KeyPlatform,
  isChord,
  isHostOwnedKey,
  keyPlatformOf,
  shortcutOf,
  shortcutsOf,
} from './interaction.js'

const typingKeys: ReadonlySet<string> = new Set(['Backspace', 'Delete'])

const isTypingIntoField = (event: KeyboardEvent): boolean => {
  const target = event.target
  if (!(target instanceof HTMLElement)) {
    return false
  }
  const isEditable =
    target.isContentEditable ||
    ((target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement) &&
      !target.readOnly)
  const isTypingKey =
    (event.key.length === 1 && !event.metaKey && !event.ctrlKey) ||
    typingKeys.has(event.key)
  return isEditable && isTypingKey
}

const platformOf = (target: Document): KeyPlatform =>
  Option.match(Option.fromNullishOr(target.defaultView), {
    onNone: () => 'Other',
    onSome: view => keyPlatformOf(view.navigator),
  })

const pressedOf = (input: KeyInput, platform: KeyPlatform): string =>
  isChord(input)
    ? shortcutOf(input, platform)
    : Option.getOrElse(
        Array.head(shortcutsOf([input.key], platform, 'Browser')),
        () => input.key,
      )

/**
 * Routes document key presses to a bound Program: `+` sends Increment,
 * Cmd-K opens the action menu, arrows and Escape move through it. Typing
 * into an editable field stays with the field. A press the browser keeps
 * for itself, such as `⌘2`, which switches tabs, is never sent and never
 * stopped ({@link isHostOwnedKey}). When a key runs an Action, or names
 * one that is unavailable, the document says so for a moment
 * ({@link showEcho}), and every control shows its hint
 * ({@link listenForHints}). Returns a function that stops listening.
 *
 * @example
 * ```typescript
 * const stop = listenToDocumentKeys(counter, document)
 * ```
 */
export const listenToDocumentKeys = (
  bound: Readonly<{
    pressKey: (input: KeyInput) => boolean
    echoOfKey?: (input: KeyInput) => Option.Option<Echo>
  }>,
  target: Document,
): (() => void) => {
  const stopHints = listenForHints(target)
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing || isTypingIntoField(event)) {
      return
    }
    const input: KeyInput = {
      key: event.key,
      isMeta: event.metaKey,
      isControl: event.ctrlKey,
      isShift: event.shiftKey,
    }
    const platform = platformOf(target)
    if (isHostOwnedKey('Browser', platform, input)) {
      return
    }
    const maybeEcho =
      bound.echoOfKey === undefined ? Option.none() : bound.echoOfKey(input)
    const isHandled = bound.pressKey(input)
    if (isHandled) {
      event.preventDefault()
    }
    Option.map(
      Option.filter(
        maybeEcho,
        echo => isHandled === Option.isNone(echo.maybeNote),
      ),
      echo => {
        showEcho(target, { ...echo, keys: [pressedOf(input, platform)] })
      },
    )
  }
  target.addEventListener('keydown', onKeyDown)
  return () => {
    target.removeEventListener('keydown', onKeyDown)
    stopHints()
    clearEcho(target)
  }
}
