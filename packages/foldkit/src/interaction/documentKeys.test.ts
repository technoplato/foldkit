import { Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import { bindCounter } from '../test/apps/catalogCounter.js'
import { listenToDocumentKeys } from './documentKeys.js'

const stops: Array<() => void> = []

afterEach(() => {
  stops.splice(0).forEach(stop => {
    stop()
  })
  document.body.replaceChildren()
})

const listen = (bound: ReturnType<typeof bindCounter>): void => {
  stops.push(listenToDocumentKeys(bound, document))
}

const press = (
  target: EventTarget,
  key: string,
  init: KeyboardEventInit = {},
): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  })
  target.dispatchEvent(event)
  return event
}

const inputIn = (isReadOnly: boolean): HTMLInputElement => {
  const input = document.createElement('input')
  input.readOnly = isReadOnly
  document.body.append(input)
  return input
}

describe('listenToDocumentKeys', () => {
  it('sends the Action a key names and prevents the default', () => {
    const bound = bindCounter()
    listen(bound)
    expect(press(document, '+').defaultPrevented).toBe(true)
    expect(bound.readModel().count).toBe(1)
  })

  it('leaves a key no Action or menu takes to the browser', () => {
    const bound = bindCounter()
    listen(bound)
    expect(press(document, 'x').defaultPrevented).toBe(false)
  })

  it('lets typing into an editable field stay with the field', () => {
    const bound = bindCounter()
    listen(bound)
    expect(press(inputIn(false), '+').defaultPrevented).toBe(false)
    expect(bound.readModel().count).toBe(0)
  })

  it('still routes keys from a read-only field and chords from any field', () => {
    const bound = bindCounter()
    listen(bound)
    press(inputIn(true), '+')
    expect(bound.readModel().count).toBe(1)
    press(inputIn(false), 'k', { metaKey: true })
    expect(Option.isSome(bound.menu())).toBe(true)
  })

  it('stops listening when stopped', () => {
    const bound = bindCounter()
    listenToDocumentKeys(bound, document)()
    press(document, '+')
    expect(bound.readModel().count).toBe(0)
  })
})
