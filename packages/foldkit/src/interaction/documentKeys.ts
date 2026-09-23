import type { KeyInput } from './interaction.js'

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

/**
 * Routes document key presses to a bound Program: `+` sends Increment,
 * Cmd-K opens the action menu, arrows and Escape move through it. Typing
 * into an editable field stays with the field. Returns a function that
 * stops listening.
 *
 * @example
 * ```typescript
 * const stop = listenToDocumentKeys(counter, document)
 * ```
 */
export const listenToDocumentKeys = (
  bound: Readonly<{ pressKey: (input: KeyInput) => boolean }>,
  target: Document,
): (() => void) => {
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing || isTypingIntoField(event)) {
      return
    }
    const isHandled = bound.pressKey({
      key: event.key,
      isMeta: event.metaKey,
      isControl: event.ctrlKey,
      isShift: event.shiftKey,
    })
    if (isHandled) {
      event.preventDefault()
    }
  }
  target.addEventListener('keydown', onKeyDown)
  return () => {
    target.removeEventListener('keydown', onKeyDown)
  }
}
