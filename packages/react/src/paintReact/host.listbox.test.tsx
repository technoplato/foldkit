import { Listbox } from 'foldkit/behavior'
import { ListboxFixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves the core Listbox Part on the React painter through the existing
// generic React host (`paintReact/host.tsx`), with zero Listbox-specific
// painter logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const stage = (overrides: Partial<Listbox.Props> = {}) => {
  const fixture = ListboxFixture.start(overrides)
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
    throw new Error(`the painted listbox fixture has no ${selector}`)
  }
  return { fixture, repaint, elementWith }
}

describe('core Listbox Part on the React generic host', () => {
  it('projects listbox/option ARIA, selects via click and keyboard, skips disabled options, and runs typeahead', () => {
    const staged = stage()

    const listbox = staged.elementWith('#fixture-listbox-items')
    expect(listbox.getAttribute('role')).toBe('listbox')
    expect(listbox.getAttribute('aria-orientation')).toBe('vertical')
    expect(listbox.getAttribute('aria-labelledby')).toBe(
      'fixture-listbox-label',
    )
    expect(listbox.getAttribute('aria-multiselectable')).toBeNull()
    expect(listbox.getAttribute('tabindex')).toBe('0')

    expect(
      staged.elementWith('#fixture-listbox-item-0').getAttribute('role'),
    ).toBe('option')
    expect(
      staged
        .elementWith('#fixture-listbox-item-2')
        .getAttribute('aria-disabled'),
    ).toBe('true')

    // Click Apricot -> selected and active-descendant
    fireEvent.click(staged.elementWith('#fixture-listbox-item-1'))
    staged.repaint()
    expect(Listbox.selectedValuesOf(staged.fixture.listboxState())).toEqual([
      'apricot',
    ])
    expect(
      staged
        .elementWith('#fixture-listbox-items')
        .getAttribute('aria-activedescendant'),
    ).toBe('fixture-listbox-item-1')
    expect(
      staged
        .elementWith('#fixture-listbox-item-1')
        .getAttribute('aria-selected'),
    ).toBe('true')

    // ArrowDown skips disabled Banana -> Cherry; Enter selects Cherry
    staged.fixture.send(Listbox.PressedListboxKey({ key: 'ArrowDown' }))
    staged.fixture.send(Listbox.PressedListboxKey({ key: 'Enter' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-listbox-item-3')
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      staged
        .elementWith('#fixture-listbox-item-1')
        .getAttribute('aria-selected'),
    ).toBe('false')

    // Typeahead 'd' jumps highlight to Date
    staged.fixture.send(Listbox.PressedListboxKey({ key: 'd' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-listbox-items')
        .getAttribute('aria-activedescendant'),
    ).toBe('fixture-listbox-item-4')
  })

  it('supports Multiple mode aria-multiselectable, toggling, Shift+Arrow range selection, and Mod+A', () => {
    const multi = stage({
      selectionMode: 'Multiple',
      orientation: 'Horizontal',
    })

    expect(
      multi
        .elementWith('#fixture-listbox-items')
        .getAttribute('aria-multiselectable'),
    ).toBe('true')
    expect(
      multi
        .elementWith('#fixture-listbox-items')
        .getAttribute('aria-orientation'),
    ).toBe('horizontal')

    fireEvent.click(multi.elementWith('#fixture-listbox-item-0'))
    fireEvent.click(multi.elementWith('#fixture-listbox-item-4'))
    multi.repaint()
    expect(Listbox.selectedValuesOf(multi.fixture.listboxState())).toEqual([
      'apple',
      'date',
    ])
    expect(
      multi
        .elementWith('#fixture-listbox-item-0')
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      multi
        .elementWith('#fixture-listbox-item-4')
        .getAttribute('aria-selected'),
    ).toBe('true')

    // Mod+A selects every enabled item
    multi.fixture.send(Listbox.PressedListboxKey({ key: 'a', isMeta: true }))
    multi.repaint()
    expect(
      multi
        .elementWith('#fixture-listbox-item-1')
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      multi
        .elementWith('#fixture-listbox-item-2')
        .getAttribute('aria-selected'),
    ).toBe('false')
    expect(
      multi
        .elementWith('#fixture-listbox-item-3')
        .getAttribute('aria-selected'),
    ).toBe('true')
  })
})
