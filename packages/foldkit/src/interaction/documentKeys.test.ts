import { Option } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { bindCounter } from '../test/apps/catalogCounter.js'
import { hintShowDelayMs } from './documentHints.js'
import { listenToDocumentKeys } from './documentKeys.js'
import { keyPlatformOf } from './interaction.js'

const isMac = keyPlatformOf(navigator) === 'Mac'

const echoText = (): string =>
  document.querySelector('.fk-echo')?.textContent ?? ''

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

  it('leaves the chord that switches tabs to the browser, even with the menu open', () => {
    const bound = bindCounter()
    listen(bound)
    press(document, 'k', { metaKey: true })
    const tabChord = isMac ? { metaKey: true } : { ctrlKey: true }
    expect(press(document, '1', tabChord).defaultPrevented).toBe(false)
    expect(bound.readModel().count).toBe(0)
    expect(Option.isSome(bound.menu())).toBe(true)
  })

  it('says what a key ran, and why a key did nothing', () => {
    const bound = bindCounter()
    listen(bound)
    press(document, 'r')
    expect(echoText()).toContain('Reset')
    expect(echoText()).toContain('Unavailable: count is already 0')
    press(document, '+')
    expect(echoText()).toContain('Increment')
    expect(echoText()).not.toContain('Unavailable')
  })

  it('says nothing for a key no Action declares', () => {
    const bound = bindCounter()
    listen(bound)
    press(document, 'x')
    expect(document.querySelector('.fk-echo')).toBe(null)
  })

  it('shows the hint of a control the pointer rests on', () => {
    vi.useFakeTimers()
    const bound = bindCounter()
    listen(bound)
    const button = document.createElement('button')
    button.setAttribute('data-hint', 'Sets the count to 0')
    document.body.append(button)
    button.dispatchEvent(new Event('pointerover', { bubbles: true }))
    vi.advanceTimersByTime(hintShowDelayMs)
    expect(document.querySelector('.fk-hint')?.textContent).toContain(
      'Sets the count to 0',
    )
    vi.useRealTimers()
  })

  it('stops listening when stopped', () => {
    const bound = bindCounter()
    listenToDocumentKeys(bound, document)()
    press(document, '+')
    expect(bound.readModel().count).toBe(0)
  })
})
