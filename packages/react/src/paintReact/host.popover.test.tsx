import { Option } from 'effect'
import { Popover } from 'foldkit/behavior'
import { PopoverFixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves the core Popover Part on the React painter through the existing
// generic React host (`paintReact/host.tsx`), with zero Popover-specific painter logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const stage = (mode: 'non-modal' | 'modal' = 'non-modal') => {
  const fixture =
    mode === 'modal' ? PopoverFixture.startModal() : PopoverFixture.start()
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
    throw new Error(`the painted popover fixture has no ${selector}`)
  }
  return { fixture, repaint, elementWith }
}

describe('core Popover Part on the React generic host', () => {
  it('opens non-modal popover, projects WAI-ARIA, dismisses via blur, backdrop, and CloseButton', () => {
    const staged = stage('non-modal')

    const trigger = staged.elementWith('#fixture-popover-button')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog')
    expect(trigger.getAttribute('aria-controls')).toBe('fixture-popover-panel')

    fireEvent.click(trigger)
    staged.repaint()
    expect(Popover.isOpen(staged.fixture.popoverState())).toBe(true)
    expect(
      staged
        .elementWith('#fixture-popover-button')
        .getAttribute('aria-expanded'),
    ).toBe('true')

    const panel = staged.elementWith('#fixture-popover-panel')
    expect(panel.getAttribute('role')).toBe('dialog')
    expect(panel.getAttribute('aria-modal')).toBe('false')
    expect(panel.getAttribute('aria-activedescendant')).toBe(
      'fixture-popover-close',
    )

    // Blur dismisses without returning focus
    staged.fixture.send(Popover.BlurredPopoverPanel())
    staged.repaint()
    expect(Popover.isOpen(staged.fixture.popoverState())).toBe(false)
    expect(Popover.returnFocusIdOf(staged.fixture.popoverState())).toEqual(
      Option.none(),
    )

    // Reopen and dismiss via backdrop -> restores focus to trigger button
    fireEvent.click(staged.elementWith('#fixture-popover-button'))
    staged.repaint()
    expect(Popover.isOpen(staged.fixture.popoverState())).toBe(true)
    fireEvent.click(staged.elementWith('#fixture-popover-backdrop'))
    staged.repaint()
    expect(Popover.isOpen(staged.fixture.popoverState())).toBe(false)
    expect(Popover.returnFocusIdOf(staged.fixture.popoverState())).toEqual(
      Option.some('fixture-popover-button'),
    )

    // Reopen and close via CloseButton
    fireEvent.click(staged.elementWith('#fixture-popover-button'))
    staged.repaint()
    fireEvent.click(staged.elementWith('#fixture-popover-close'))
    staged.repaint()
    expect(Popover.isOpen(staged.fixture.popoverState())).toBe(false)
  })

  it('projects modal popover aria-modal true, traps Tab focus, and dismisses on Escape', () => {
    const staged = stage('modal')

    fireEvent.click(staged.elementWith('#fixture-modal-popover-button'))
    staged.repaint()
    expect(Popover.isOpen(staged.fixture.popoverState())).toBe(true)
    expect(
      staged
        .elementWith('#fixture-modal-popover-panel')
        .getAttribute('aria-modal'),
    ).toBe('true')

    // Tab wraps focus inside modal popover
    staged.fixture.send(Popover.PressedPopoverKey({ key: 'Tab' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-modal-popover-panel')
        .getAttribute('aria-activedescendant'),
    ).toBe('fixture-modal-popover-apply')

    // Escape dismisses modal popover and restores focus
    staged.fixture.send(Popover.PressedPopoverKey({ key: 'Escape' }))
    staged.repaint()
    expect(Popover.isOpen(staged.fixture.popoverState())).toBe(false)
    expect(Popover.returnFocusIdOf(staged.fixture.popoverState())).toEqual(
      Option.some('fixture-modal-popover-button'),
    )
  })
})
