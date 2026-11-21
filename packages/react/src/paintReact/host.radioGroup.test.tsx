import { Option } from 'effect'
import { RadioGroup } from 'foldkit/behavior'
import { RadioGroupFixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves the core RadioGroup Part on the React painter through the
// existing generic React host (`paintReact/host.tsx`), with zero RadioGroup-
// specific painter logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const stage = (overrides: Partial<RadioGroup.Props> = {}) => {
  const fixture = RadioGroupFixture.start(overrides)
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
    throw new Error(`the painted radio group fixture has no ${selector}`)
  }
  return { fixture, repaint, elementWith }
}

describe('core RadioGroup Part on the React generic host', () => {
  it('projects radiogroup/radio ARIA, selects via option/label click and keyboard, and skips disabled options', () => {
    const staged = stage()

    const group = staged.elementWith('#fixture-radio-group')
    expect(group.getAttribute('role')).toBe('radiogroup')
    expect(group.getAttribute('aria-orientation')).toBe('vertical')
    expect(group.getAttribute('aria-label')).toBe('Drawing tool')

    const option0 = staged.elementWith('#fixture-radio-option-0')
    expect(option0.getAttribute('role')).toBe('radio')
    expect(option0.getAttribute('aria-checked')).toBe('false')
    expect(option0.getAttribute('aria-labelledby')).toBe(
      'fixture-radio-option-0-label',
    )
    expect(option0.getAttribute('aria-describedby')).toBe(
      'fixture-radio-option-0-description',
    )
    expect(option0.getAttribute('tabindex')).toBe('0')

    // Click Fill option -> selects Fill and updates roving tabindex
    fireEvent.click(staged.elementWith('#fixture-radio-option-1'))
    staged.repaint()
    expect(
      RadioGroup.selectedValueOf(
        staged.fixture.radioGroupState(),
        staged.fixture.props,
      ),
    ).toEqual(Option.some('fill'))
    expect(
      staged
        .elementWith('#fixture-radio-option-1')
        .getAttribute('aria-checked'),
    ).toBe('true')
    expect(
      staged.elementWith('#fixture-radio-option-1').getAttribute('tabindex'),
    ).toBe('0')
    expect(
      staged.elementWith('#fixture-radio-option-0').getAttribute('tabindex'),
    ).toBe('-1')

    // ArrowDown skips disabled Eraser -> selects Lasso
    staged.fixture.send(RadioGroup.PressedRadioKey({ key: 'ArrowDown' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-radio-option-3')
        .getAttribute('aria-checked'),
    ).toBe('true')
    expect(
      staged.elementWith('#fixture-radio-option-3').getAttribute('tabindex'),
    ).toBe('0')

    // Click Brush label -> selects Brush
    fireEvent.click(staged.elementWith('#fixture-radio-option-0-label'))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-radio-option-0')
        .getAttribute('aria-checked'),
    ).toBe('true')
  })

  it('supports horizontal orientation and RTL arrow navigation', () => {
    const rtl = stage({
      orientation: 'Horizontal',
      direction: 'Rtl',
      defaultValue: 'brush',
    })
    expect(
      rtl.elementWith('#fixture-radio-group').getAttribute('aria-orientation'),
    ).toBe('horizontal')
    rtl.fixture.send(RadioGroup.PressedRadioKey({ key: 'ArrowLeft' }))
    rtl.repaint()
    expect(
      rtl.elementWith('#fixture-radio-option-1').getAttribute('aria-checked'),
    ).toBe('true')
  })

  it('keeps the roving tab stop on an enabled option when the selected option is disabled', () => {
    const disabledSelected = stage({ defaultValue: 'eraser' })
    expect(
      disabledSelected
        .elementWith('#fixture-radio-option-2')
        .getAttribute('aria-checked'),
    ).toBe('true')
    expect(
      disabledSelected
        .elementWith('#fixture-radio-option-2')
        .getAttribute('tabindex'),
    ).toBe('-1')
    expect(
      disabledSelected
        .elementWith('#fixture-radio-option-0')
        .getAttribute('tabindex'),
    ).toBe('0')
  })

  it('projects readOnly and required ARIA and refuses selection changes when readOnly', () => {
    const readOnly = stage({
      isReadOnly: true,
      isRequired: true,
      defaultValue: 'brush',
    })
    expect(
      readOnly
        .elementWith('#fixture-radio-group')
        .getAttribute('aria-readonly'),
    ).toBe('true')
    expect(
      readOnly
        .elementWith('#fixture-radio-group')
        .getAttribute('aria-required'),
    ).toBe('true')
    fireEvent.click(readOnly.elementWith('#fixture-radio-option-1'))
    readOnly.repaint()
    expect(
      readOnly
        .elementWith('#fixture-radio-option-0')
        .getAttribute('aria-checked'),
    ).toBe('true')
  })
})
