import { Array, Context, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as Tooltip from '../behavior/tooltip.js'
import {
  __clearRuntime as clearHtmlRuntime,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import * as TooltipFixture from '../test/tooltipFixture.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves the core Tooltip Part on the HTML painter through the existing
// generic slot attributes (`Slot.ariaOf` + `slotAttributesOf`), with zero
// Tooltip-specific painter logic.

type Vnode = Readonly<{
  sel?: string
  data?: Readonly<{
    attrs?: Readonly<Record<string, string | number | boolean>>
    class?: Readonly<Record<string, boolean>>
    on?: Readonly<Record<string, unknown>>
  }>
  children?: ReadonlyArray<Vnode | string>
  text?: string
}>

const paintedOf = (tree: UiNode, onAction: (tag: string) => void): Vnode => {
  setHtmlRuntime(message => {
    if (typeof message === 'string') {
      onAction(message)
    }
  }, Context.empty())
  try {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return paintHtml(tree, tag => tag) as unknown as Vnode
  } finally {
    clearHtmlRuntime()
  }
}

const elementOf = (node: Vnode): HTMLElement => {
  const tag = Option.getOrElse(
    Array.head((node.sel ?? 'div').split(/[.#]/u)),
    () => 'div',
  )
  const element = document.createElement(tag === '' ? 'div' : tag)
  Object.entries(node.data?.attrs ?? {}).forEach(([name, value]) => {
    element.setAttribute(name, String(value))
  })
  Object.entries(node.data?.class ?? {}).forEach(([name, isOn]) => {
    if (isOn) {
      element.classList.add(name)
    }
  })
  const clickHandler = node.data?.on?.['click']
  if (typeof clickHandler === 'function') {
    element.addEventListener('click', event => {
      clickHandler(event)
    })
  }
  ;(node.children ?? []).forEach(child => {
    element.append(typeof child === 'string' ? child : elementOf(child))
  })
  if (node.text !== undefined) {
    element.append(node.text)
  }
  return element
}

const stageRunning = (fixture: TooltipFixture.Running) => {
  const root = document.createElement('div')
  document.body.append(root)

  const repaint = (): void => {
    const vnode = paintedOf(fixture.tree(), fixture.press)
    root.replaceChildren(elementOf(vnode))
  }
  repaint()

  const elementWith = (selector: string): HTMLElement => {
    const found = root.querySelector(selector)
    if (found instanceof HTMLElement) {
      return found
    }
    throw new Error(`the painted tooltip fixture has no ${selector}`)
  }

  return {
    fixture,
    repaint,
    elementWith,
    strike: () => {
      root.remove()
    },
  }
}

const struck: Array<() => void> = []

afterEach(() => {
  struck.splice(0).forEach(strike => {
    strike()
  })
})

const staged = (overrides: Partial<Tooltip.Props> = {}) => {
  const made = stageRunning(TooltipFixture.start(overrides))
  struck.push(made.strike)
  return made
}

describe('core Tooltip Part on the HTML generic host', () => {
  it('paints role="tooltip", id, hidden, and conditional aria-describedby across hover delay, focus open, mouse focus suppression, and Escape dismissal', () => {
    const made = staged()

    // Closed initially: trigger has no aria-describedby; content has role="tooltip" + hidden
    const closedTrigger = made.elementWith('#fixture-tooltip-trigger')
    const closedPanel = made.elementWith('#fixture-tooltip-panel')
    expect(closedTrigger.getAttribute('role')).toBe('button')
    expect(closedTrigger.getAttribute('aria-label')).toBe('Save document')
    expect(closedTrigger.hasAttribute('aria-describedby')).toBe(false)
    expect(closedPanel.getAttribute('role')).toBe('tooltip')
    expect(closedPanel.getAttribute('id')).toBe('fixture-tooltip-panel')
    expect(closedPanel.hasAttribute('hidden')).toBe(true)

    // Mouse press + focus does not open tooltip
    made.fixture.send(Tooltip.PressTooltipPointer({ pointerType: 'mouse' }))
    made.fixture.send(Tooltip.FocusTooltipTrigger())
    made.repaint()
    expect(Tooltip.isOpen(made.fixture.tooltipState())).toBe(false)
    expect(
      made
        .elementWith('#fixture-tooltip-trigger')
        .hasAttribute('aria-describedby'),
    ).toBe(false)

    // Hover starts 500ms delay; still closed until ElapsedTooltipShow(v1)
    made.fixture.send(Tooltip.EnterTooltipTrigger())
    expect(made.fixture.lastCommands()[0]?.args).toEqual({
      version: 1,
      afterMs: 500,
    })
    made.repaint()
    expect(
      made.elementWith('#fixture-tooltip-panel').hasAttribute('hidden'),
    ).toBe(true)

    // Delay completes -> open, trigger gains aria-describedby, panel removes hidden
    made.fixture.send(Tooltip.ElapsedTooltipShow({ version: 1 }))
    made.repaint()
    expect(Tooltip.isOpen(made.fixture.tooltipState())).toBe(true)
    expect(
      made
        .elementWith('#fixture-tooltip-trigger')
        .getAttribute('aria-describedby'),
    ).toBe('fixture-tooltip-panel')
    expect(
      made.elementWith('#fixture-tooltip-panel').hasAttribute('hidden'),
    ).toBe(false)

    // Escape dismisses immediately and suppresses re-hover until pointer leaves
    made.fixture.send(Tooltip.PressTooltipEscape())
    made.repaint()
    expect(Tooltip.isOpen(made.fixture.tooltipState())).toBe(false)
    expect(
      made
        .elementWith('#fixture-tooltip-trigger')
        .hasAttribute('aria-describedby'),
    ).toBe(false)
    expect(
      made.elementWith('#fixture-tooltip-panel').hasAttribute('hidden'),
    ).toBe(true)

    made.fixture.send(Tooltip.LeaveTooltipTrigger())

    // Keyboard focus opens immediately
    made.fixture.send(Tooltip.FocusTooltipTrigger())
    made.repaint()
    expect(Tooltip.isOpen(made.fixture.tooltipState())).toBe(true)
    expect(
      made
        .elementWith('#fixture-tooltip-trigger')
        .getAttribute('aria-describedby'),
    ).toBe('fixture-tooltip-panel')

    // HideTooltip Catalog action closes it
    made.fixture.press(Tooltip.HideTooltip.tag)
    made.repaint()
    expect(Tooltip.isOpen(made.fixture.tooltipState())).toBe(false)
    expect(
      made.elementWith('#fixture-tooltip-panel').hasAttribute('hidden'),
    ).toBe(true)
  })

  it('paints aria-disabled and ignores hover/focus when disabled', () => {
    const made = staged({ isDisabled: true })

    expect(
      made
        .elementWith('#fixture-tooltip-trigger')
        .getAttribute('aria-disabled'),
    ).toBe('true')
    made.fixture.send(Tooltip.EnterTooltipTrigger())
    made.fixture.send(Tooltip.FocusTooltipTrigger())
    made.repaint()
    expect(Tooltip.isOpen(made.fixture.tooltipState())).toBe(false)
    expect(
      made.elementWith('#fixture-tooltip-panel').hasAttribute('hidden'),
    ).toBe(true)
  })
})
