import { Tooltip } from 'foldkit/behavior'
import { TooltipFixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves the core Tooltip Part on the React painter through the existing
// generic React host (`paintReact/host.tsx`), with zero Tooltip-specific
// painter logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const stageRunning = (fixture: TooltipFixture.Running) => {
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
    throw new Error(`the painted tooltip fixture has no ${selector}`)
  }
  return { fixture, repaint, elementWith }
}

describe('core Tooltip Part on the React generic host', () => {
  it('paints role="tooltip", id, hidden, and conditional aria-describedby across hover delay, focus open, Escape dismiss, and HideTooltip', () => {
    const staged = stageRunning(TooltipFixture.start())

    const trigger = staged.elementWith('#fixture-tooltip-trigger')
    const panel = staged.elementWith('#fixture-tooltip-panel')
    expect(trigger.getAttribute('role')).toBe('button')
    expect(trigger.getAttribute('aria-label')).toBe('Save document')
    expect(trigger.hasAttribute('aria-describedby')).toBe(false)
    expect(panel.getAttribute('role')).toBe('tooltip')
    expect(panel.hidden).toBe(true)

    // Mouse focus does not open tooltip
    staged.fixture.send(Tooltip.PressTooltipPointer({ pointerType: 'mouse' }))
    staged.fixture.send(Tooltip.FocusTooltipTrigger())
    staged.repaint()
    expect(Tooltip.isOpen(staged.fixture.tooltipState())).toBe(false)
    expect(staged.elementWith('#fixture-tooltip-panel').hidden).toBe(true)

    // Hover delay opens tooltip and links aria-describedby
    staged.fixture.send(Tooltip.EnterTooltipTrigger())
    expect(staged.fixture.lastCommands()[0]?.args).toEqual({
      version: 1,
      afterMs: 500,
    })
    staged.fixture.send(Tooltip.ElapsedTooltipShow({ version: 1 }))
    staged.repaint()

    expect(
      staged
        .elementWith('#fixture-tooltip-trigger')
        .getAttribute('aria-describedby'),
    ).toBe('fixture-tooltip-panel')
    expect(staged.elementWith('#fixture-tooltip-panel').hidden).toBe(false)

    // Escape dismisses tooltip
    staged.fixture.send(Tooltip.PressTooltipEscape())
    staged.repaint()
    expect(Tooltip.isOpen(staged.fixture.tooltipState())).toBe(false)
    expect(
      staged
        .elementWith('#fixture-tooltip-trigger')
        .hasAttribute('aria-describedby'),
    ).toBe(false)
    expect(staged.elementWith('#fixture-tooltip-panel').hidden).toBe(true)

    // Disengage then focus open; HideTooltip button closes via React click
    staged.fixture.send(Tooltip.LeaveTooltipTrigger())
    staged.fixture.send(Tooltip.FocusTooltipTrigger())
    staged.repaint()
    expect(staged.elementWith('#fixture-tooltip-panel').hidden).toBe(false)

    const buttons = staged.elementWith('div').querySelectorAll('button')
    const hideButton = Array.from(buttons).find(
      button => button.textContent === 'Hide tooltip',
    )
    expect(hideButton).toBeDefined()
    if (hideButton !== undefined) {
      fireEvent.click(hideButton)
    }
    staged.repaint()
    expect(Tooltip.isOpen(staged.fixture.tooltipState())).toBe(false)
    expect(staged.elementWith('#fixture-tooltip-panel').hidden).toBe(true)
  })

  it('keeps the trigger primary action working alongside its tooltip slot', () => {
    const staged = stageRunning(TooltipFixture.start())
    fireEvent.click(staged.elementWith('#fixture-tooltip-trigger'))
    staged.repaint()
    expect(staged.fixture.model().confirmedCount).toBe(1)
  })
})
