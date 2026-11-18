import { Option } from 'effect'
import {
  type ButtonNode,
  type TextInputNode,
  isClearedOnSubmit,
  isSubmittedOnLeave,
  submittedTagOf,
} from 'foldkit/renderers'
import { type ReactElement, useEffect, useRef, useState } from 'react'
import { TextInput as NativeTextInput, type TextStyle } from 'react-native'

import { type Paint, pressOf } from './paint.js'

const fieldRadius = 12

const fieldPaddingX = 14

/** The style of a text field, from the look. */
export const fieldStyleOf = (paint: Paint): TextStyle => ({
  alignSelf: 'stretch',
  backgroundColor: paint.look.colors.Field,
  borderColor: paint.look.colors.Border,
  borderRadius: fieldRadius,
  borderWidth: 1,
  color: paint.look.colors.Text,
  fontSize: paint.look.sizes.bodySize,
  height: paint.look.sizes.fieldHeight,
  paddingHorizontal: fieldPaddingX,
})

/**
 * What submitting a field presses: its `againAction` when the text has not
 * changed, such as the next match of a search, else the Action its text
 * submits, if any.
 *
 * @example
 * ```typescript
 * submitPressOf(searchField, 'lamp', 'Enter') // Some(Button NextMatch) when it already shows `lamp`
 * ```
 */
export const submitPressOf = (
  input: TextInputNode,
  draft: string,
  how: 'Enter' | 'Leave',
): Option.Option<ButtonNode> => {
  const label = input.label ?? input.placeholder ?? draft
  const againAction = input.againAction
  const isUnchanged = draft.trim() !== '' && draft.trim() === input.value.trim()
  if (how === 'Enter' && againAction !== undefined && isUnchanged) {
    return Option.some(pressOf(againAction, label))
  } else {
    return Option.map(submittedTagOf(input, draft), tag => pressOf(tag, label))
  }
}

/**
 * A text field that presses its Action when it is submitted: on the
 * keyboard's return key, and for a field that edits, such as a title,
 * when editing ends after a change. It holds what is typed until then, so
 * typing never sends a Message per keystroke.
 */
export const TextField = ({
  input,
  paint,
}: Readonly<{ input: TextInputNode; paint: Paint }>): ReactElement => {
  const [draft, setDraft] = useState(input.value)
  const lastSubmitted = useRef<Option.Option<string>>(Option.none())
  useEffect(() => {
    setDraft(input.value)
  }, [input.value])
  const submit = (how: 'Enter' | 'Leave'): void => {
    const maybePress = submitPressOf(input, draft, how)
    const isAgain = Option.exists(
      maybePress,
      press => press.action === input.againAction,
    )
    if (!isAgain && Option.contains(lastSubmitted.current, draft)) {
      return
    }
    if (Option.isSome(maybePress)) {
      lastSubmitted.current = Option.some(draft)
      paint.onPress(maybePress.value)
    }
    if (isClearedOnSubmit(input)) {
      lastSubmitted.current = Option.none()
      setDraft('')
    }
  }
  return (
    <NativeTextInput
      accessibilityLabel={input.label}
      autoCapitalize="none"
      autoCorrect={false}
      autoFocus={input.focused === true}
      blurOnSubmit={input.againAction === undefined}
      onChangeText={text => {
        lastSubmitted.current = Option.none()
        setDraft(text)
      }}
      onEndEditing={() => {
        if (isSubmittedOnLeave(input)) {
          submit('Leave')
        }
      }}
      onSubmitEditing={() => {
        submit('Enter')
      }}
      placeholder={input.placeholder}
      placeholderTextColor={paint.look.colors.FaintText}
      returnKeyType={input.againAction === undefined ? 'done' : 'search'}
      style={[fieldStyleOf(paint), paint.styles.TextInput]}
      value={draft}
    />
  )
}

/**
 * A text field that sends every keystroke. It takes the focus when the
 * Model says `focused`, lets go of it when the Model stops saying so and
 * the field has a `blurToken`, and tells the Model when it gains and
 * loses the focus.
 */
export const TokenField = ({
  input,
  paint,
}: Readonly<{ input: TextInputNode; paint: Paint }>): ReactElement => {
  const ref = useRef<NativeTextInput>(null)
  const isFocused = input.focused === true
  const token = input.token
  const focusToken = input.focusToken
  const blurToken = input.blurToken
  const label = input.label ?? input.placeholder ?? ''
  const isBlurredByModel = blurToken !== undefined
  useEffect(() => {
    const field = ref.current
    if (field === null) {
      return
    }
    if (isFocused && !field.isFocused()) {
      field.focus()
    } else if (!isFocused && field.isFocused() && isBlurredByModel) {
      field.blur()
    }
  }, [isFocused, isBlurredByModel])
  return (
    <NativeTextInput
      ref={ref}
      accessibilityLabel={input.label}
      autoCapitalize="none"
      autoCorrect={false}
      autoFocus={isFocused}
      onBlur={() => {
        if (blurToken !== undefined) {
          paint.onPress({ _tag: 'Button', label, token: blurToken })
        }
      }}
      onChangeText={text => {
        if (token !== undefined && paint.onInput !== undefined) {
          paint.onInput(token, text)
        }
      }}
      onFocus={() => {
        if (focusToken !== undefined) {
          paint.onPress({ _tag: 'Button', label, token: focusToken })
        }
      }}
      placeholder={input.placeholder}
      placeholderTextColor={paint.look.colors.FaintText}
      style={[fieldStyleOf(paint), paint.styles.TextInput]}
      value={input.value}
    />
  )
}
