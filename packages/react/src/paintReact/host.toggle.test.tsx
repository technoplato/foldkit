import { Toggle } from 'foldkit/behavior'
import { ToggleFixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves the core Toggle Part on the React painter through the existing
// generic React host (`paintReact/host.tsx`), with zero Toggle- or
// Button-specific painter logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const stage = (overrides: Partial<Toggle.Props> = {}) => {
  const fixture = ToggleFixture.start(overrides)
  const painted = () =>
    paintTree(fixture.tree(), {
      onPress: button => {
        const tag = button.action ?? button.token
        if (tag !== undefined) {
          fixture.press(tag)
        }
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
    throw new Error(`the painted toggle fixture has no ${selector}`)
  }
  return { fixture, repaint, elementWith }
}

describe('core Toggle Part on the React generic host', () => {
  it('projects role=button and WAI-ARIA aria-pressed, toggles on button/label click and keyboard, and handles SetButtonPressed', () => {
    const staged = stage()

    const button = staged.elementWith('#fixture-toggle-button')
    expect(button.getAttribute('role')).toBe('button')
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(button.getAttribute('aria-labelledby')).toBe('fixture-toggle-label')
    expect(button.getAttribute('aria-describedby')).toBe(
      'fixture-toggle-description',
    )
    expect(button.getAttribute('tabindex')).toBe('0')

    fireEvent.click(button)
    staged.repaint()
    expect(Toggle.isPressed(staged.fixture.toggleState())).toBe(true)
    expect(
      staged.elementWith('#fixture-toggle-button').getAttribute('aria-pressed'),
    ).toBe('true')

    fireEvent.click(staged.elementWith('#fixture-toggle-label'))
    staged.repaint()
    expect(Toggle.isPressed(staged.fixture.toggleState())).toBe(false)
    expect(
      staged.elementWith('#fixture-toggle-button').getAttribute('aria-pressed'),
    ).toBe('false')

    staged.fixture.send(Toggle.PressedButtonKey({ key: ' ' }))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-toggle-button').getAttribute('aria-pressed'),
    ).toBe('true')

    staged.fixture.send(Toggle.SetButtonPressed({ isPressed: false }))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-toggle-button').getAttribute('aria-pressed'),
    ).toBe('false')
  })

  it('projects disabled ARIA and refuses toggles when disabled', () => {
    const disabled = stage({ isDisabled: true })
    const disabledButton = disabled.elementWith('#fixture-toggle-button')
    expect(disabledButton.getAttribute('aria-disabled')).toBe('true')
    expect(disabledButton.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(disabledButton)
    disabled.repaint()
    expect(Toggle.isPressed(disabled.fixture.toggleState())).toBe(false)
  })

  it('projects readOnly ARIA and refuses toggles when readOnly', () => {
    const readOnly = stage({ isReadOnly: true, defaultPressed: true })
    const readOnlyButton = readOnly.elementWith('#fixture-toggle-button')
    expect(readOnlyButton.getAttribute('aria-readonly')).toBe('true')
    expect(readOnlyButton.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(readOnlyButton)
    readOnly.repaint()
    expect(Toggle.isPressed(readOnly.fixture.toggleState())).toBe(true)
  })
})
