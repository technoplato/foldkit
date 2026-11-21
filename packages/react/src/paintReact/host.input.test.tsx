import { Input } from 'foldkit/behavior'
import { InputFixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves the core Input Part on the React painter through the existing
// generic React host (`paintReact/host.tsx`), with zero Input-specific painter
// logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const stage = (overrides: Partial<Input.Props> = {}) => {
  const fixture = InputFixture.start(overrides)
  const painted = () =>
    paintTree(fixture.tree(), {
      onPress: button => {
        const tag = button.action ?? button.token
        if (tag !== undefined) {
          fixture.press(tag)
        }
      },
      onInput: (token, value) => {
        fixture.type(token, value)
      },
    })
  const view = render(painted())
  const repaint = (): void => {
    act(() => {
      view.rerender(painted())
    })
  }
  const elementWith = (selector: string): HTMLElement => {
    const found = view.container.querySelector(selector)
    if (found instanceof HTMLElement) {
      return found
    }
    throw new Error(`the painted input fixture has no ${selector}`)
  }
  return { fixture, repaint, elementWith }
}

describe('core Input Part on the React generic host', () => {
  it('projects textbox WAI-ARIA, handles typing, commit, cancel, and clear', () => {
    const staged = stage({ isRequired: true, isInvalid: true })

    const input = staged.elementWith('#fixture-input-input')
    expect(input.getAttribute('role')).toBe('textbox')
    expect(input.getAttribute('aria-labelledby')).toBe('fixture-input-label')
    expect(input.getAttribute('aria-describedby')).toBe(
      'fixture-input-description fixture-input-error',
    )
    expect(input.getAttribute('aria-required')).toBe('true')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('tabindex')).toBe('0')

    fireEvent.change(input, { target: { value: 'Grace Hopper' } })
    staged.repaint()
    expect(Input.draftOf(staged.fixture.inputState())).toBe('Grace Hopper')
    expect(Input.isDirty(staged.fixture.inputState())).toBe(true)

    staged.fixture.send(Input.PressedInputKey({ key: 'Enter' }))
    staged.repaint()
    expect(Input.isIdle(staged.fixture.inputState())).toBe(true)
    expect(Input.valueOf(staged.fixture.inputState())).toBe('Grace Hopper')

    fireEvent.click(staged.elementWith('#fixture-input-clear'))
    staged.repaint()
    expect(Input.valueOf(staged.fixture.inputState())).toBe('')
  })

  it('toggles password visibility through the VisibilityToggle button', () => {
    const staged = stage({ type: 'password' })

    const toggle = staged.elementWith('#fixture-input-visibility')
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(toggle.getAttribute('aria-controls')).toBe('fixture-input-input')

    fireEvent.click(toggle)
    staged.repaint()
    expect(Input.isPasswordVisible(staged.fixture.inputState())).toBe(true)
    expect(
      staged
        .elementWith('#fixture-input-visibility')
        .getAttribute('aria-pressed'),
    ).toBe('true')
  })

  it('projects disabled ARIA and refuses edits when disabled', () => {
    const disabled = stage({ isDisabled: true, defaultValue: 'locked' })
    const disabledInput = disabled.elementWith('#fixture-input-input')
    expect(disabledInput.getAttribute('aria-disabled')).toBe('true')
    fireEvent.change(disabledInput, { target: { value: 'nope' } })
    disabled.repaint()
    expect(Input.draftOf(disabled.fixture.inputState())).toBe('locked')
  })

  it('projects readOnly ARIA and refuses edits when readOnly', () => {
    const readOnly = stage({ isReadOnly: true, defaultValue: 'readonly' })
    const readOnlyInput = readOnly.elementWith('#fixture-input-input')
    expect(readOnlyInput.getAttribute('aria-readonly')).toBe('true')
    fireEvent.change(readOnlyInput, { target: { value: 'nope' } })
    readOnly.repaint()
    expect(Input.draftOf(readOnly.fixture.inputState())).toBe('readonly')
  })
})
