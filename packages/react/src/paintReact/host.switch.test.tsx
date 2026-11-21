import { Switch } from 'foldkit/behavior'
import { SwitchFixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves the core Switch Part on the React painter through the existing
// generic React host (`paintReact/host.tsx`), with zero Switch-specific painter logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const stage = (overrides: Partial<Switch.Props> = {}) => {
  const fixture = SwitchFixture.start(overrides)
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
    throw new Error(`the painted switch fixture has no ${selector}`)
  }
  return { fixture, repaint, elementWith }
}

describe('core Switch Part on the React generic host', () => {
  it('projects role=switch and WAI-ARIA, toggles on control/label click and keyboard, and handles SetSwitchChecked', () => {
    const staged = stage()

    const control = staged.elementWith('#fixture-switch-control')
    expect(control.getAttribute('role')).toBe('switch')
    expect(control.getAttribute('aria-checked')).toBe('false')
    expect(control.getAttribute('aria-labelledby')).toBe('fixture-switch-label')
    expect(control.getAttribute('aria-describedby')).toBe(
      'fixture-switch-description',
    )
    expect(control.getAttribute('tabindex')).toBe('0')

    fireEvent.click(control)
    staged.repaint()
    expect(Switch.isChecked(staged.fixture.switchState())).toBe(true)
    expect(
      staged
        .elementWith('#fixture-switch-control')
        .getAttribute('aria-checked'),
    ).toBe('true')

    fireEvent.click(staged.elementWith('#fixture-switch-label'))
    staged.repaint()
    expect(Switch.isChecked(staged.fixture.switchState())).toBe(false)
    expect(
      staged
        .elementWith('#fixture-switch-control')
        .getAttribute('aria-checked'),
    ).toBe('false')

    staged.fixture.send(Switch.PressedSwitchKey({ key: ' ' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-switch-control')
        .getAttribute('aria-checked'),
    ).toBe('true')

    staged.fixture.send(Switch.SetSwitchChecked({ isChecked: false }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-switch-control')
        .getAttribute('aria-checked'),
    ).toBe('false')
  })

  it('projects disabled and required ARIA and refuses toggles when disabled', () => {
    const disabled = stage({ isDisabled: true, isRequired: true })
    const disabledControl = disabled.elementWith('#fixture-switch-control')
    expect(disabledControl.getAttribute('aria-disabled')).toBe('true')
    expect(disabledControl.getAttribute('aria-required')).toBe('true')
    fireEvent.click(disabledControl)
    disabled.repaint()
    expect(Switch.isChecked(disabled.fixture.switchState())).toBe(false)
  })

  it('projects readOnly ARIA and refuses toggles when readOnly', () => {
    const readOnly = stage({ isReadOnly: true })
    const readOnlyControl = readOnly.elementWith('#fixture-switch-control')
    expect(readOnlyControl.getAttribute('aria-readonly')).toBe('true')
    fireEvent.click(readOnlyControl)
    readOnly.repaint()
    expect(Switch.isChecked(readOnly.fixture.switchState())).toBe(false)
  })
})
