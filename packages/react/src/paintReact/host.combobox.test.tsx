import { Combobox } from 'foldkit/behavior'
import { ComboboxFixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves the core Combobox Part on the React painter through the
// existing generic React host (`paintReact/host.tsx`), with zero Combobox-
// specific painter logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const stage = (overrides: Partial<Combobox.Props> = {}) => {
  const fixture = ComboboxFixture.start(overrides)
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
    throw new Error(`the painted combobox fixture has no ${selector}`)
  }
  return { fixture, view, repaint, elementWith }
}

describe('core Combobox Part on the React generic host', () => {
  it('projects combobox/listbox/option ARIA, filters live on input, navigates filtered items, selects, and closes', () => {
    const staged = stage()

    const input = staged.elementWith('#fixture-combobox-input')
    expect(input.getAttribute('role')).toBe('combobox')
    expect(input.getAttribute('aria-haspopup')).toBe('listbox')
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(input.getAttribute('aria-controls')).toBe('fixture-combobox-content')
    expect(input.getAttribute('aria-labelledby')).toBe('fixture-combobox-label')
    expect(input.getAttribute('aria-describedby')).toBe(
      'fixture-combobox-description',
    )

    const content = staged.elementWith('#fixture-combobox-content')
    expect(content.getAttribute('role')).toBe('listbox')
    expect(content.hasAttribute('hidden')).toBe(true)

    // Typing 'ap' opens popup and filters to Apple (0) and Apricot (1), auto-highlighting Apple
    fireEvent.change(input, { target: { value: 'ap' } })
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-combobox-input')
        .getAttribute('aria-expanded'),
    ).toBe('true')
    expect(
      staged
        .elementWith('#fixture-combobox-input')
        .getAttribute('aria-activedescendant'),
    ).toBe('fixture-combobox-option-0')
    expect(
      staged.view.container.querySelectorAll(
        '#fixture-combobox-content [role="option"]',
      ),
    ).toHaveLength(2)

    // ArrowDown moves highlight to Apricot (option-1)
    staged.fixture.send(Combobox.PressedComboboxKey({ key: 'ArrowDown' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-combobox-input')
        .getAttribute('aria-activedescendant'),
    ).toBe('fixture-combobox-option-1')

    // Enter selects Apricot, closes popup, and updates input value
    staged.fixture.send(Combobox.PressedComboboxKey({ key: 'Enter' }))
    staged.repaint()
    expect(Combobox.selectedValuesOf(staged.fixture.comboboxState())).toEqual([
      'apricot',
    ])
    expect(Combobox.inputValueOf(staged.fixture.comboboxState())).toBe(
      'Apricot',
    )
    expect(
      staged
        .elementWith('#fixture-combobox-input')
        .getAttribute('aria-expanded'),
    ).toBe('false')
  })

  it('supports Multiple mode toggling, allowCustomValue, and Backspace removal on the React generic host', () => {
    const multi = stage({
      selectionMode: 'Multiple',
      allowCustomValue: true,
      isInvalid: true,
    })

    expect(
      multi.elementWith('#fixture-combobox-input').getAttribute('aria-invalid'),
    ).toBe('true')
    expect(
      multi
        .elementWith('#fixture-combobox-content')
        .getAttribute('aria-multiselectable'),
    ).toBe('true')

    fireEvent.click(multi.elementWith('#fixture-combobox-trigger'))
    multi.repaint()
    fireEvent.click(multi.elementWith('#fixture-combobox-option-0'))
    multi.repaint()

    // Type custom tag 'Mango' and press Enter -> adds custom value while staying open
    fireEvent.change(multi.elementWith('#fixture-combobox-input'), {
      target: { value: 'Mango' },
    })
    multi.fixture.send(Combobox.PressedComboboxKey({ key: 'Enter' }))
    multi.repaint()
    expect(Combobox.selectedValuesOf(multi.fixture.comboboxState())).toEqual([
      'apple',
      'Mango',
    ])
    expect(Combobox.isOpen(multi.fixture.comboboxState())).toBe(true)

    // Backspace removes 'Mango'
    multi.fixture.send(Combobox.PressedComboboxKey({ key: 'Backspace' }))
    multi.repaint()
    expect(Combobox.selectedValuesOf(multi.fixture.comboboxState())).toEqual([
      'apple',
    ])
  })
})
