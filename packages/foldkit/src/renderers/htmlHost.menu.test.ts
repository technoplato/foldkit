import { Array, Effect, Fiber, Option, Stream } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as Host from '../behavior/host.js'
import * as LongPress from '../behavior/longPress.js'
import * as Menu from '../behavior/menu.js'
import * as Typeahead from '../behavior/typeahead.js'
import * as MenuFixture from '../test/menuFixture.js'
import { paintHtml } from './html.js'
import { slotHostMount, slotPressEventName } from './htmlHost.js'
import type { UiNode } from './types.js'

// NOTE: proves the core Menu Part on the HTML painter through the existing
// generic `htmlHost` (`slotHostMount`), with zero Menu-specific painter logic.

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

const holdAttributes = ['data-hold-count', 'data-hold-press']

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 5)
  })

const stage = async () => {
  const fixture = MenuFixture.start()
  const root = document.createElement('div')
  document.body.append(root)

  const mountRoot = () => {
    root.replaceChildren(elementOf(paintedOf(fixture.tree()), fixture.press))
  }
  mountRoot()

  const elementWith = (selector: string): HTMLElement => {
    const found = root.querySelector(selector)
    if (found instanceof HTMLElement) {
      return found
    }
    throw new Error(`the painted menu fixture has no ${selector}`)
  }

  const list = elementWith('ul.fk-list')
  const row = elementWith('li.fk-item[data-key="salt-road"]')

  const syncHold = (): void => {
    const painted = vnodesOf(paintedOf(fixture.tree()))
    const attrs = Option.match(
      Array.findFirst(painted, node => node.data?.class?.['fk-list'] === true),
      { onNone: () => ({}), onSome: node => node.data?.attrs ?? {} },
    )
    holdAttributes.forEach(name => {
      const value = attrs[name]
      if (value === undefined) {
        list.removeAttribute(name)
      } else if (list.getAttribute(name) !== String(value)) {
        list.setAttribute(name, String(value))
      }
    })
  }

  list.addEventListener(slotPressEventName, event => {
    if (event instanceof CustomEvent && typeof event.detail === 'string') {
      fixture.press(event.detail)
      syncHold()
    }
  })
  const host = Effect.runFork(Stream.runDrain(slotHostMount<never>().f(list)))
  await tick()
  await tick()

  const pointer = (
    target: HTMLElement,
    type: string,
    x: number,
    pointerType = 'touch',
  ): void => {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        pointerType,
        clientX: x,
        clientY: 10,
      }),
    )
  }

  const elapse = async (ms: number): Promise<void> => {
    await fixture.elapse(ms)
    syncHold()
    await tick()
  }

  const strike = async (): Promise<void> => {
    await Effect.runPromise(Fiber.interrupt(host))
    root.remove()
  }

  return {
    fixture,
    root,
    row,
    repaint: mountRoot,
    elementWith,
    pointer,
    elapse,
    strike,
  }
}

const struck: Array<() => Promise<void>> = []

afterEach(async () => {
  await Promise.all(struck.splice(0).map(strike => strike()))
})

const staged = async () => {
  const made = await stage()
  struck.push(made.strike)
  return made
}

describe('core Menu Part on the HTML generic host', () => {
  it.each(Host.personActs)(
    '%s on a row opens the core Menu Part on that target',
    async personAct => {
      const made = await staged()
      if (personAct === 'Hold') {
        made.pointer(made.row, 'pointerdown', 10)
        await made.elapse(LongPress.holdMs)
        made.pointer(made.row, 'pointerup', 10)
      } else {
        made.row.dispatchEvent(
          new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
        )
      }
      expect(Menu.isOpen(made.fixture.menuState())).toBe(true)
      expect(Menu.targetOf(made.fixture.menuState())).toEqual(
        Option.some('salt-road'),
      )
    },
  )

  it('toggles open, roves, searches with typeahead, selects an item, and dismisses with zero Menu-specific painter logic', async () => {
    const made = await staged()

    // Trigger starts collapsed
    const trigger = made.elementWith('#fixture-menu-button')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    // Press trigger button -> opens core Menu Part
    made.fixture.press(Menu.ToggleMenu.tag)
    made.repaint()
    expect(Menu.isOpen(made.fixture.menuState())).toBe(true)
    expect(
      made.elementWith('#fixture-menu-button').getAttribute('aria-expanded'),
    ).toBe('true')

    // Roving keyboard navigation skips disabled 'archive' (index 2)
    made.fixture.send(Menu.PressedMenuKey({ key: 'ArrowDown' }))
    made.fixture.send(Menu.PressedMenuKey({ key: 'ArrowDown' }))
    made.fixture.send(Menu.PressedMenuKey({ key: 'ArrowDown' }))
    made.repaint()
    expect(Menu.activeIndexOf(made.fixture.menuState())).toEqual(Option.some(3))
    expect(
      made.elementWith('#fixture-menu-item-3').getAttribute('aria-current'),
    ).toBe('true')
    expect(
      made.elementWith('#fixture-menu-item-2').getAttribute('aria-disabled'),
    ).toBe('true')

    // Typeahead matches 'Duplicate' and resets via Command.answerAfter
    made.fixture.send(Menu.PressedMenuKey({ key: 'd' }))
    made.fixture.send(Menu.PressedMenuKey({ key: 'u' }))
    made.repaint()
    expect(Menu.activeIndexOf(made.fixture.menuState())).toEqual(Option.some(1))
    expect(
      made.elementWith('#fixture-menu-item-1').getAttribute('aria-current'),
    ).toBe('true')
    await made.fixture.elapse(Typeahead.resetMs)
    expect(Menu.searchQueryOf(made.fixture.menuState())).toBe('')

    // Selecting an item closes the menu and records selection
    made.fixture.press('SelectMenuItem:duplicate')
    made.repaint()
    expect(Menu.isOpen(made.fixture.menuState())).toBe(false)
    expect(Menu.lastSelectedOf(made.fixture.menuState())).toEqual(
      Option.some({ value: 'duplicate', index: 1 }),
    )

    // Reopen and dismiss via Backdrop/DismissMenu
    made.fixture.press(Menu.ToggleMenu.tag)
    expect(Menu.isOpen(made.fixture.menuState())).toBe(true)
    made.fixture.press(Menu.DismissMenu.tag)
    expect(Menu.isOpen(made.fixture.menuState())).toBe(false)
  })
})
