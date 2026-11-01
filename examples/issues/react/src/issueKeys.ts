import { Option } from 'effect'
import {
  type KeyPress,
  type KeyTarget,
  type Model,
  tokenForKeyPress,
} from 'issues-core-example'
import { sendScreenToken } from 'issues-react-bindings-example'
import { useEffect, useRef } from 'react'

const FIELD_TAGS = ['INPUT', 'TEXTAREA', 'SELECT']
const CONTROL_TAGS = ['A', 'BUTTON', 'SUMMARY']

const targetOf = (element: EventTarget | null): KeyTarget => {
  if (!(element instanceof HTMLElement)) {
    return 'Page'
  } else if (
    FIELD_TAGS.includes(element.tagName) ||
    element.isContentEditable
  ) {
    return 'Field'
  } else if (CONTROL_TAGS.includes(element.tagName)) {
    return 'Control'
  } else {
    return 'Page'
  }
}

const pressOf = (event: KeyboardEvent): KeyPress => ({
  isAlt: event.altKey,
  isControl: event.ctrlKey,
  isMeta: event.metaKey,
  isShift: event.shiftKey,
  key: event.key,
  target: targetOf(event.target),
})

const ESCAPE = 'Escape'

/**
 * Binds the page's keys: it reports each key to the Program and sends the
 * token the Program names. What a key means lives in `tokenForKeyPress`. Esc
 * in a field the Program does not bind lets go of the field, as a field does.
 */
export const useIssueKeys = (model: Model): void => {
  const latestModel = useRef(model)
  latestModel.current = model
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.isComposing) {
        return
      }
      const press = pressOf(event)
      const maybeToken = tokenForKeyPress(latestModel.current, press)
      if (Option.isSome(maybeToken)) {
        event.preventDefault()
        sendScreenToken(maybeToken.value)
      } else if (
        press.key === ESCAPE &&
        press.target === 'Field' &&
        event.target instanceof HTMLElement
      ) {
        event.target.blur()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}
