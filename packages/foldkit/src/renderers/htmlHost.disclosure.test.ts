import { Array, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as Disclosure from '../behavior/disclosure.js'
import * as Presence from '../behavior/presence.js'
import * as DisclosureFixture from '../test/disclosureFixture.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves the core Disclosure / Accordion Part on the HTML painter
// through the existing generic slot attributes, with zero Disclosure-specific
// painter logic.

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

const paintedOf = (tree: UiNode): Vnode =>
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  paintHtml(tree, tag => tag) as unknown as Vnode

const elementOf = (
  node: Vnode,
  onAction: (tag: string) => void,
): HTMLElement => {
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
  if (typeof clickHandler === 'string') {
    element.addEventListener('click', () => onAction(clickHandler))
  }
  ;(node.children ?? []).forEach(child => {
    element.append(
      typeof child === 'string' ? child : elementOf(child, onAction),
    )
  })
  if (node.text !== undefined) {
    element.append(node.text)
  }
  return element
}

const vnodesOf = (node: Vnode | string): ReadonlyArray<Vnode> =>
  typeof node === 'string'
    ? []
    : [node, ...(node.children ?? []).flatMap(vnodesOf)]

const stageRunning = (fixture: DisclosureFixture.Running) => {
  const root = document.createElement('div')
  document.body.append(root)

  let latestVnode = paintedOf(fixture.tree())
  const repaint = (): void => {
    latestVnode = paintedOf(fixture.tree())
    root.replaceChildren(elementOf(latestVnode, fixture.press))
  }
  repaint()

  const vnodeWithId = (id: string): Vnode =>
    Option.getOrThrow(
      Array.findFirst(
        vnodesOf(latestVnode),
        node => node.data?.attrs?.['id'] === id,
      ),
    )

  const elementWith = (selector: string): HTMLElement => {
    const found = root.querySelector(selector)
    if (found instanceof HTMLElement) {
      return found
    }
    throw new Error(`the painted disclosure fixture has no ${selector}`)
  }

  return {
    fixture,
    repaint,
    vnodeWithId,
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

const stagedSingle = (overrides: Partial<Disclosure.Props> = {}) => {
  const made = stageRunning(DisclosureFixture.startSingle(overrides))
  struck.push(made.strike)
  return made
}

const stagedAccordion = (overrides: Partial<Disclosure.Props> = {}) => {
  const made = stageRunning(DisclosureFixture.startAccordion(overrides))
  struck.push(made.strike)
  return made
}

describe('core Disclosure / Accordion Part on the HTML generic host', () => {
  it('paints single disclosure ARIA linkage, toggles on press/Enter/Space, honors disabled, and keeps animated leaving panels unhidden until settled', () => {
    const made = stagedSingle({ isAnimated: true })

    const button = made.elementWith('#fixture-disclosure-button')
    const panel = made.elementWith('#fixture-disclosure-panel')

    expect(button.getAttribute('role')).toBe('button')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.getAttribute('aria-controls')).toBe(
      'fixture-disclosure-panel',
    )
    expect(button.getAttribute('aria-label')).toBe('Shipping details')
    expect(panel.getAttribute('role')).toBe('region')
    expect(panel.getAttribute('aria-labelledby')).toBe(
      'fixture-disclosure-button',
    )
    expect(panel.hasAttribute('hidden')).toBe(true)

    // Toggle open -> EnterStart -> AdvanceFrame -> EndAnimation -> Open
    made.fixture.press(Disclosure.ToggleDisclosure.tag)
    made.repaint()
    expect(
      made
        .elementWith('#fixture-disclosure-button')
        .getAttribute('aria-expanded'),
    ).toBe('true')
    expect(
      made.elementWith('#fixture-disclosure-panel').hasAttribute('hidden'),
    ).toBe(false)

    made.fixture.send(Disclosure.AdvancedDisclosureFrame({}))
    made.fixture.send(Disclosure.EndedDisclosureAnimation({}))
    expect(
      Disclosure.presenceOf(made.fixture.disclosureState(), made.fixture.props),
    ).toEqual(Presence.Open())

    // Closing via Space key enters LeaveStart: aria-expanded becomes false, panel stays unhidden until animation settles
    made.fixture.send(Disclosure.PressedDisclosureKey({ key: ' ' }))
    made.repaint()
    expect(
      made
        .elementWith('#fixture-disclosure-button')
        .getAttribute('aria-expanded'),
    ).toBe('false')
    expect(
      made.elementWith('#fixture-disclosure-panel').hasAttribute('hidden'),
    ).toBe(false)

    made.fixture.send(Disclosure.AdvancedDisclosureFrame({}))
    made.fixture.send(Disclosure.EndedDisclosureAnimation({}))
    made.repaint()
    expect(
      made.elementWith('#fixture-disclosure-panel').hasAttribute('hidden'),
    ).toBe(true)

    // Disabled disclosure sets aria-disabled and binds no click handler
    const disabled = stagedSingle({ isDisabled: true })
    expect(
      disabled
        .elementWith('#fixture-disclosure-button')
        .getAttribute('aria-disabled'),
    ).toBe('true')
    expect(
      disabled.vnodeWithId('fixture-disclosure-button').data?.on?.['click'],
    ).toBeUndefined()
  })

  it('paints accordion ARIA linkage, enforces single/multiple and collapsible rules, and roves focus across headers via RovingFocus', () => {
    const single = stagedAccordion()

    const root = single.elementWith('#fixture-accordion-root')
    expect(root.getAttribute('aria-orientation')).toBe('vertical')
    expect(root.getAttribute('aria-label')).toBe('Frequently asked questions')

    // Overview starts expanded & non-collapsible (aria-disabled="true"), Billing disabled, Shipping & Returns collapsed
    expect(
      single
        .elementWith('#fixture-accordion-button-overview')
        .getAttribute('aria-expanded'),
    ).toBe('true')
    expect(
      single
        .elementWith('#fixture-accordion-button-overview')
        .getAttribute('aria-disabled'),
    ).toBe('true')
    expect(
      single
        .elementWith('#fixture-accordion-button-overview')
        .getAttribute('tabindex'),
    ).toBe('0')
    expect(
      single
        .elementWith('#fixture-accordion-panel-overview')
        .hasAttribute('hidden'),
    ).toBe(false)
    expect(
      single
        .elementWith('#fixture-accordion-panel-shipping')
        .hasAttribute('hidden'),
    ).toBe(true)
    expect(
      single.vnodeWithId('fixture-accordion-button-billing').data?.on?.[
        'click'
      ],
    ).toBeUndefined()

    // Pressing overview while non-collapsible is ignored
    single.fixture.press('ToggleDisclosureItem:overview')
    single.repaint()
    expect(
      single
        .elementWith('#fixture-accordion-panel-overview')
        .hasAttribute('hidden'),
    ).toBe(false)

    // Pressing shipping switches open section from overview -> shipping
    single.fixture.press('ToggleDisclosureItem:shipping')
    single.repaint()
    expect(
      single
        .elementWith('#fixture-accordion-panel-overview')
        .hasAttribute('hidden'),
    ).toBe(true)
    expect(
      single
        .elementWith('#fixture-accordion-panel-shipping')
        .hasAttribute('hidden'),
    ).toBe(false)

    // ArrowDown skips disabled billing -> focuses returns without expanding it; Enter expands returns
    single.fixture.send(Disclosure.PressedDisclosureKey({ key: 'ArrowDown' }))
    single.repaint()
    expect(
      single
        .elementWith('#fixture-accordion-button-returns')
        .getAttribute('tabindex'),
    ).toBe('0')
    expect(
      single
        .elementWith('#fixture-accordion-panel-returns')
        .hasAttribute('hidden'),
    ).toBe(true)

    single.fixture.send(Disclosure.PressedDisclosureKey({ key: 'Enter' }))
    single.repaint()
    expect(
      single
        .elementWith('#fixture-accordion-panel-returns')
        .hasAttribute('hidden'),
    ).toBe(false)
    expect(
      single
        .elementWith('#fixture-accordion-panel-shipping')
        .hasAttribute('hidden'),
    ).toBe(true)

    // Multiple + Horizontal + RTL mode
    const multiRtl = stagedAccordion({
      isMultiple: true,
      orientation: 'Horizontal',
      direction: 'Rtl',
    })
    expect(
      multiRtl
        .elementWith('#fixture-accordion-root')
        .getAttribute('aria-orientation'),
    ).toBe('horizontal')
    multiRtl.fixture.send(Disclosure.PressedDisclosureKey({ key: 'ArrowLeft' }))
    multiRtl.fixture.send(Disclosure.PressedDisclosureKey({ key: ' ' }))
    multiRtl.repaint()
    expect(
      multiRtl
        .elementWith('#fixture-accordion-panel-overview')
        .hasAttribute('hidden'),
    ).toBe(false)
    expect(
      multiRtl
        .elementWith('#fixture-accordion-panel-shipping')
        .hasAttribute('hidden'),
    ).toBe(false)
  })
})
