import { Disclosure, Presence } from 'foldkit/behavior'
import { DisclosureFixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves the core Disclosure / Accordion Part on the React painter
// through the existing generic React host (`paintReact/host.tsx`), with zero
// Disclosure-specific painter logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const stageRunning = (fixture: DisclosureFixture.Running) => {
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
    throw new Error(`the painted disclosure fixture has no ${selector}`)
  }
  return { fixture, repaint, elementWith }
}

describe('core Disclosure / Accordion Part on the React generic host', () => {
  it('paints single disclosure ARIA linkage, toggles on click, and tracks animated Presence through generic React slot props', () => {
    const staged = stageRunning(
      DisclosureFixture.startSingle({ isAnimated: true }),
    )

    const button = staged.elementWith('#fixture-disclosure-button')
    const panel = staged.elementWith('#fixture-disclosure-panel')
    expect(button.getAttribute('role')).toBe('button')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.getAttribute('aria-controls')).toBe(
      'fixture-disclosure-panel',
    )
    expect(panel.getAttribute('role')).toBe('region')
    expect(panel.getAttribute('aria-labelledby')).toBe(
      'fixture-disclosure-button',
    )
    expect(panel.hidden).toBe(true)

    fireEvent.click(button)
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-disclosure-button')
        .getAttribute('aria-expanded'),
    ).toBe('true')
    expect(staged.elementWith('#fixture-disclosure-panel').hidden).toBe(false)

    staged.fixture.send(Disclosure.AdvancedDisclosureFrame({}))
    staged.fixture.send(Disclosure.EndedDisclosureAnimation({}))
    expect(
      Disclosure.presenceOf(
        staged.fixture.disclosureState(),
        staged.fixture.props,
      ),
    ).toEqual(Presence.Open())

    // Click again -> LeaveStart keeps panel mounted until animation settles
    fireEvent.click(staged.elementWith('#fixture-disclosure-button'))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-disclosure-button')
        .getAttribute('aria-expanded'),
    ).toBe('false')
    expect(staged.elementWith('#fixture-disclosure-panel').hidden).toBe(false)

    staged.fixture.send(Disclosure.AdvancedDisclosureFrame({}))
    staged.fixture.send(Disclosure.EndedDisclosureAnimation({}))
    staged.repaint()
    expect(staged.elementWith('#fixture-disclosure-panel').hidden).toBe(true)
  })

  it('paints accordion sections with single/multiple open, collapsible, disabled items, and keyboard roving via the generic React host', () => {
    const staged = stageRunning(DisclosureFixture.startAccordion())

    expect(
      staged
        .elementWith('#fixture-accordion-root')
        .getAttribute('aria-orientation'),
    ).toBe('vertical')
    expect(
      staged
        .elementWith('#fixture-accordion-button-overview')
        .getAttribute('aria-expanded'),
    ).toBe('true')
    expect(
      staged.elementWith('#fixture-accordion-button-overview').tabIndex,
    ).toBe(0)
    expect(
      staged.elementWith('#fixture-accordion-button-shipping').tabIndex,
    ).toBe(-1)
    expect(
      staged
        .elementWith('#fixture-accordion-button-billing')
        .getAttribute('aria-disabled'),
    ).toBe('true')
    expect(staged.elementWith('#fixture-accordion-panel-overview').hidden).toBe(
      false,
    )
    expect(staged.elementWith('#fixture-accordion-panel-shipping').hidden).toBe(
      true,
    )

    // Clicking shipping switches panel visibility
    fireEvent.click(staged.elementWith('#fixture-accordion-button-shipping'))
    staged.repaint()
    expect(staged.elementWith('#fixture-accordion-panel-shipping').hidden).toBe(
      false,
    )
    expect(staged.elementWith('#fixture-accordion-panel-overview').hidden).toBe(
      true,
    )

    // ArrowDown skips disabled billing -> focuses returns -> Enter expands returns
    staged.fixture.send(Disclosure.PressedDisclosureKey({ key: 'ArrowDown' }))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-accordion-button-returns').tabIndex,
    ).toBe(0)
    expect(staged.elementWith('#fixture-accordion-panel-returns').hidden).toBe(
      true,
    )

    staged.fixture.send(Disclosure.PressedDisclosureKey({ key: 'Enter' }))
    staged.repaint()
    expect(staged.elementWith('#fixture-accordion-panel-returns').hidden).toBe(
      false,
    )
    expect(staged.elementWith('#fixture-accordion-panel-shipping').hidden).toBe(
      true,
    )
  })

  it('supports multiple open accordion sections simultaneously through the generic React host', () => {
    const multi = stageRunning(
      DisclosureFixture.startAccordion({
        id: 'fixture-accordion-multi',
        isMultiple: true,
      }),
    )
    fireEvent.click(
      multi.elementWith('#fixture-accordion-multi-button-shipping'),
    )
    multi.repaint()
    expect(
      multi.elementWith('#fixture-accordion-multi-panel-overview').hidden,
    ).toBe(false)
    expect(
      multi.elementWith('#fixture-accordion-multi-panel-shipping').hidden,
    ).toBe(false)
  })
})
