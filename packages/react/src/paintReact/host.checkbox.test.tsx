import { Checkbox } from 'foldkit/behavior'
import { CheckboxFixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves the core Checkbox Part on the React painter through the existing
// generic React host (`paintReact/host.tsx`), with zero Checkbox-specific
// painter logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const stageRunning = (fixture: CheckboxFixture.Running) => {
  const painted = () =>
    paintTree(fixture.tree(), {
      onPress: button => {
        if (button.action !== undefined) {
          fixture.press(button.action)
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
    throw new Error(`the painted checkbox fixture has no ${selector}`)
  }
  return { fixture, repaint, elementWith }
}

describe('core Checkbox Part on the React generic host', () => {
  it('paints WAI-ARIA checkbox attributes, tri-state checked/mixed transitions, and label click toggling via generic React slot props', () => {
    const staged = stageRunning(CheckboxFixture.start())

    const control = staged.elementWith('#fixture-checkbox-control')
    const label = staged.elementWith('#fixture-checkbox-label')
    const description = staged.elementWith('#fixture-checkbox-description')

    expect(control.getAttribute('role')).toBe('checkbox')
    expect(control.getAttribute('aria-checked')).toBe('false')
    expect(control.getAttribute('aria-labelledby')).toBe(
      'fixture-checkbox-label',
    )
    expect(control.getAttribute('aria-describedby')).toBe(
      'fixture-checkbox-description',
    )
    expect(control.tabIndex).toBe(0)
    expect(label.id).toBe('fixture-checkbox-label')
    expect(description.id).toBe('fixture-checkbox-description')

    // Click control -> Checked
    fireEvent.click(control)
    staged.repaint()
    expect(staged.fixture.checkboxState()).toEqual(Checkbox.Checked())
    expect(
      staged
        .elementWith('#fixture-checkbox-control')
        .getAttribute('aria-checked'),
    ).toBe('true')

    // Click label -> Unchecked
    fireEvent.click(staged.elementWith('#fixture-checkbox-label'))
    staged.repaint()
    expect(staged.fixture.checkboxState()).toEqual(Checkbox.Unchecked())
    expect(
      staged
        .elementWith('#fixture-checkbox-control')
        .getAttribute('aria-checked'),
    ).toBe('false')

    // Indeterminate -> aria-checked="mixed", Space toggles to Checked, Enter is ignored
    staged.fixture.send(Checkbox.SetCheckboxIndeterminate())
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-checkbox-control')
        .getAttribute('aria-checked'),
    ).toBe('mixed')

    staged.fixture.send(Checkbox.PressedCheckboxKey({ key: 'Enter' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-checkbox-control')
        .getAttribute('aria-checked'),
    ).toBe('mixed')

    staged.fixture.send(Checkbox.PressedCheckboxKey({ key: ' ' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-checkbox-control')
        .getAttribute('aria-checked'),
    ).toBe('true')
  })

  it('projects disabled, readOnly, required, and invalid ARIA attributes and blocks toggling', () => {
    const disabled = stageRunning(
      CheckboxFixture.start(
        {
          id: 'react-disabled-box',
          isDisabled: true,
          isRequired: true,
          isInvalid: true,
        },
        { initial: Checkbox.Indeterminate() },
      ),
    )

    const control = disabled.elementWith('#react-disabled-box-control')
    expect(control.getAttribute('aria-checked')).toBe('mixed')
    expect(control.getAttribute('aria-disabled')).toBe('true')
    expect(control.getAttribute('aria-required')).toBe('true')
    expect(control.getAttribute('aria-invalid')).toBe('true')

    fireEvent.click(control)
    disabled.repaint()
    expect(disabled.fixture.checkboxState()).toEqual(Checkbox.Indeterminate())

    const readOnly = stageRunning(
      CheckboxFixture.start(
        { id: 'react-readonly-box', isReadOnly: true },
        { initial: Checkbox.Checked() },
      ),
    )
    const readOnlyControl = readOnly.elementWith('#react-readonly-box-control')
    expect(readOnlyControl.getAttribute('aria-checked')).toBe('true')
    expect(readOnlyControl.getAttribute('aria-readonly')).toBe('true')

    readOnly.fixture.send(Checkbox.ToggleCheckbox())
    readOnly.repaint()
    expect(readOnly.fixture.checkboxState()).toEqual(Checkbox.Checked())
  })
})
