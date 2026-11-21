import { Array, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as Tabs from '../behavior/tabs.js'
import * as TabsFixture from '../test/tabsFixture.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves the core Tabs Part on the HTML painter through the existing
// generic slot attributes, with zero Tabs-specific painter logic.

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

const stage = (overrides: Partial<Tabs.Props> = {}) => {
  const fixture = TabsFixture.start(overrides)
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
    throw new Error(`the painted tabs fixture has no ${selector}`)
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

const staged = (overrides: Partial<Tabs.Props> = {}) => {
  const made = stage(overrides)
  struck.push(made.strike)
  return made
}

describe('core Tabs Part on the HTML generic host', () => {
  it('paints full tablist/tab/tabpanel ARIA linkage, skips disabled tabs, and switches panels on press and automatic arrows', () => {
    const made = staged()

    const tablist = made.elementWith('#fixture-tabs-list')
    expect(tablist.getAttribute('role')).toBe('tablist')
    expect(tablist.getAttribute('aria-orientation')).toBe('horizontal')
    expect(tablist.getAttribute('aria-label')).toBe('Account sections')

    // Overview starts selected & visible; Details & Security hidden; Billing disabled
    const tab0 = made.elementWith('#fixture-tabs-tab-0')
    const tab1 = made.elementWith('#fixture-tabs-tab-1')
    const tab2 = made.elementWith('#fixture-tabs-tab-2')
    const panel0 = made.elementWith('#fixture-tabs-panel-0')
    const panel1 = made.elementWith('#fixture-tabs-panel-1')

    expect(tab0.getAttribute('role')).toBe('tab')
    expect(tab0.getAttribute('aria-selected')).toBe('true')
    expect(tab0.getAttribute('aria-controls')).toBe('fixture-tabs-panel-0')
    expect(tab0.getAttribute('tabindex')).toBe('0')

    expect(tab1.getAttribute('aria-selected')).toBe('false')
    expect(tab1.getAttribute('tabindex')).toBe('-1')

    expect(tab2.getAttribute('aria-disabled')).toBe('true')
    expect(tab2.getAttribute('tabindex')).toBe('-1')

    expect(panel0.getAttribute('role')).toBe('tabpanel')
    expect(panel0.getAttribute('aria-labelledby')).toBe('fixture-tabs-tab-0')
    expect(panel0.hasAttribute('hidden')).toBe(false)
    expect(panel1.hasAttribute('hidden')).toBe(true)

    // Enabled tab binds a click handler; disabled tab does not
    expect(
      typeof made.vnodeWithId('fixture-tabs-tab-1').data?.on?.['click'],
    ).toBe('function')
    expect(
      made.vnodeWithId('fixture-tabs-tab-2').data?.on?.['click'],
    ).toBeUndefined()

    // Pressing disabled tab 2 is ignored
    made.fixture.press('SelectTab:billing')
    expect(
      Tabs.activeValueOf(made.fixture.tabsState(), made.fixture.props),
    ).toEqual(Option.some('overview'))

    // Pressing tab 1 selects Details and swaps panel visibility
    made.fixture.press('SelectTab:details')
    made.repaint()
    expect(
      Tabs.activeValueOf(made.fixture.tabsState(), made.fixture.props),
    ).toEqual(Option.some('details'))
    expect(
      made.elementWith('#fixture-tabs-tab-1').getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      made.elementWith('#fixture-tabs-tab-1').getAttribute('tabindex'),
    ).toBe('0')
    expect(
      made.elementWith('#fixture-tabs-panel-1').hasAttribute('hidden'),
    ).toBe(false)
    expect(
      made.elementWith('#fixture-tabs-panel-0').hasAttribute('hidden'),
    ).toBe(true)

    // ArrowRight skips disabled tab 2 (Billing) -> activates tab 3 (Security)
    made.fixture.send(Tabs.PressedTabKey({ key: 'ArrowRight' }))
    made.repaint()
    expect(
      Tabs.activeValueOf(made.fixture.tabsState(), made.fixture.props),
    ).toEqual(Option.some('security'))
    expect(
      made.elementWith('#fixture-tabs-tab-3').getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      made.elementWith('#fixture-tabs-panel-3').hasAttribute('hidden'),
    ).toBe(false)
  })

  it('supports manual activation mode, vertical orientation, and RTL direction with zero Tabs-specific painter code', () => {
    const manualVertical = staged({
      orientation: 'Vertical',
      activationMode: 'Manual',
    })

    expect(
      manualVertical
        .elementWith('#fixture-tabs-list')
        .getAttribute('aria-orientation'),
    ).toBe('vertical')

    // ArrowDown moves roving tabindex to Details without selecting it yet
    manualVertical.fixture.send(Tabs.PressedTabKey({ key: 'ArrowDown' }))
    manualVertical.repaint()
    expect(
      manualVertical
        .elementWith('#fixture-tabs-tab-0')
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      manualVertical
        .elementWith('#fixture-tabs-tab-0')
        .getAttribute('tabindex'),
    ).toBe('-1')
    expect(
      manualVertical
        .elementWith('#fixture-tabs-tab-1')
        .getAttribute('aria-selected'),
    ).toBe('false')
    expect(
      manualVertical
        .elementWith('#fixture-tabs-tab-1')
        .getAttribute('tabindex'),
    ).toBe('0')

    // Enter activates focused tab 1
    manualVertical.fixture.send(Tabs.PressedTabKey({ key: 'Enter' }))
    manualVertical.repaint()
    expect(
      manualVertical
        .elementWith('#fixture-tabs-tab-1')
        .getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      manualVertical
        .elementWith('#fixture-tabs-panel-1')
        .hasAttribute('hidden'),
    ).toBe(false)

    // RTL horizontal: ArrowLeft moves forward from Overview -> Details
    const rtl = staged({ direction: 'Rtl' })
    rtl.fixture.send(Tabs.PressedTabKey({ key: 'ArrowLeft' }))
    rtl.repaint()
    expect(
      Tabs.activeValueOf(rtl.fixture.tabsState(), rtl.fixture.props),
    ).toEqual(Option.some('details'))
    expect(
      rtl.elementWith('#fixture-tabs-tab-1').getAttribute('aria-selected'),
    ).toBe('true')
  })
})
