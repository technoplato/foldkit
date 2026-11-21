import { Select } from 'foldkit/behavior'
import { SelectFixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves the core Select Part on the React painter through the existing
// generic React host (`paintReact/host.tsx`), with zero Select-specific
// painter logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const stage = (overrides: Partial<Select.Props> = {}) => {
  const fixture = SelectFixture.start(overrides)
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
    throw new Error(`the painted select fixture has no ${selector}`)
  }
  return { fixture, repaint, elementWith }
}

describe('core Select Part on the React generic host', () => {
  it('projects combobox/listbox/option ARIA, opens via trigger click, navigates skipping disabled options, selects, and closes', () => {
    const staged = stage()

    const trigger = staged.elementWith('#fixture-select-trigger')
    expect(trigger.getAttribute('role')).toBe('combobox')
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.getAttribute('aria-controls')).toBe('fixture-select-content')
    expect(trigger.getAttribute('aria-labelledby')).toBe('fixture-select-label')
    expect(trigger.getAttribute('aria-describedby')).toBe(
      'fixture-select-description',
    )
    expect(trigger.textContent).toBe('Choose a fruit')

    const content = staged.elementWith('#fixture-select-content')
    expect(content.getAttribute('role')).toBe('listbox')
    expect(content.hasAttribute('hidden')).toBe(true)
    expect(content.getAttribute('aria-multiselectable')).toBeNull()

    // Click trigger -> opens listbox
    fireEvent.click(trigger)
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-select-trigger')
        .getAttribute('aria-expanded'),
    ).toBe('true')
    expect(
      staged.elementWith('#fixture-select-content').hasAttribute('hidden'),
    ).toBe(false)

    // ArrowDown -> Apple (0), ArrowDown -> Apricot (1), ArrowDown skips disabled Banana (2) -> Cherry (3)
    staged.fixture.send(Select.PressedSelectKey({ key: 'ArrowDown' }))
    staged.fixture.send(Select.PressedSelectKey({ key: 'ArrowDown' }))
    staged.fixture.send(Select.PressedSelectKey({ key: 'ArrowDown' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-select-content')
        .getAttribute('aria-activedescendant'),
    ).toBe('fixture-select-option-3')
    expect(
      staged
        .elementWith('#fixture-select-option-2')
        .getAttribute('aria-disabled'),
    ).toBe('true')

    // Enter selects Cherry and closes popup
    staged.fixture.send(Select.PressedSelectKey({ key: 'Enter' }))
    staged.repaint()
    expect(Select.selectedValuesOf(staged.fixture.selectState())).toEqual([
      'cherry',
    ])
    expect(
      staged
        .elementWith('#fixture-select-trigger')
        .getAttribute('aria-expanded'),
    ).toBe('false')
    expect(staged.elementWith('#fixture-select-trigger').textContent).toBe(
      'Cherry',
    )

    // Closed typeahead 'a' selects Apple directly
    staged.fixture.send(Select.PressedTriggerKey({ key: 'a' }))
    staged.repaint()
    expect(staged.elementWith('#fixture-select-trigger').textContent).toBe(
      'Apple',
    )
    expect(
      staged
        .elementWith('#fixture-select-trigger')
        .getAttribute('aria-expanded'),
    ).toBe('false')
  })

  it('supports Multiple mode toggling, staying open, and Tab closing on the React generic host', () => {
    const multi = stage({ selectionMode: 'Multiple', isInvalid: true })

    expect(
      multi.elementWith('#fixture-select-trigger').getAttribute('aria-invalid'),
    ).toBe('true')
    expect(
      multi
        .elementWith('#fixture-select-content')
        .getAttribute('aria-multiselectable'),
    ).toBe('true')

    fireEvent.click(multi.elementWith('#fixture-select-trigger'))
    multi.repaint()
    fireEvent.click(multi.elementWith('#fixture-select-option-0'))
    fireEvent.click(multi.elementWith('#fixture-select-option-4'))
    multi.repaint()

    expect(Select.selectedValuesOf(multi.fixture.selectState())).toEqual([
      'apple',
      'date',
    ])
    expect(multi.elementWith('#fixture-select-trigger').textContent).toBe(
      'Apple, Date',
    )
    expect(
      multi
        .elementWith('#fixture-select-trigger')
        .getAttribute('aria-expanded'),
    ).toBe('true')

    // Tab closes while retaining selection
    multi.fixture.send(Select.PressedSelectKey({ key: 'Tab' }))
    multi.repaint()
    expect(
      multi
        .elementWith('#fixture-select-trigger')
        .getAttribute('aria-expanded'),
    ).toBe('false')
    expect(Select.selectedValuesOf(multi.fixture.selectState())).toEqual([
      'apple',
      'date',
    ])
  })
})
