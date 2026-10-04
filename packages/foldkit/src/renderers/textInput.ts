import { Option, String } from 'effect'

import type { TextInputNode } from './types.js'

// SUBMIT

/**
 * The tag a submitted text field presses, the same in every painter: its
 * `action` with the trimmed text as the choice, its `clearAction` when the
 * text is empty, and nothing for a field with neither, or with no change
 * to a value it already shows.
 *
 * @example
 * ```typescript
 * submittedTagOf(TextInput({ value: '', action: 'AddReminder' }), ' Buy milk ') // Some('AddReminder:Buy milk')
 * submittedTagOf(TextInput({ value: 'Old', action: 'SetNotes', clearAction: 'ClearNotes' }), '') // Some('ClearNotes')
 * submittedTagOf(TextInput({ value: 'Old', action: 'SetNotes' }), 'Old') // None
 * ```
 */
export const submittedTagOf = (
  input: TextInputNode,
  text: string,
): Option.Option<string> => {
  const trimmed = String.trim(text)
  if (input.value !== '' && trimmed === String.trim(input.value)) {
    return Option.none()
  } else if (String.isEmpty(trimmed)) {
    return Option.fromNullishOr(input.clearAction)
  } else {
    return Option.map(
      Option.fromNullishOr(input.action),
      action => `${action}:${trimmed}`,
    )
  }
}

/**
 * True for a field that edits something: one that shows a value, such as
 * a reminder's title, or one that can be cleared, such as its notes. It
 * also submits when a person leaves it after a change, and keeps its text.
 */
export const isSubmittedOnLeave = (input: TextInputNode): boolean =>
  input.value !== '' || input.clearAction !== undefined

/**
 * True for a field that adds something and empties after it submits,
 * ready for the next entry, such as `New reminder`.
 */
export const isClearedOnSubmit = (input: TextInputNode): boolean =>
  !isSubmittedOnLeave(input)
