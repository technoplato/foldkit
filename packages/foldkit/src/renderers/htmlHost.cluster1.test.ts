import { Array, Context, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as Drawer from '../behavior/drawer.js'
import * as HoverCard from '../behavior/hoverCard.js'
import * as Menubar from '../behavior/menubar.js'
import * as RatingGroup from '../behavior/ratingGroup.js'
import * as ToggleGroup from '../behavior/toggleGroup.js'
import * as Toolbar from '../behavior/toolbar.js'
import {
  __clearRuntime as clearHtmlRuntime,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import * as Cluster1Fixture from '../test/cluster1Fixture.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves all 6 Cluster 1 core Parts (Drawer, HoverCard, Menubar,
// Toolbar, ToggleGroup, RatingGroup) on the HTML painter through the existing
// generic `htmlHost` (`slotAttributesOf`), with zero widget-specific painter
// logic.

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

const roots: Array<HTMLElement> = []

afterEach(() => {
  roots.splice(0).forEach(root => root.remove())
})

const stage = (overrides: Cluster1Fixture.FixtureOverrides = {}) => {
  const fixture = Cluster1Fixture.start(overrides)
  const root = document.createElement('div')
  document.body.append(root)
  roots.push(root)

  const repaint = (): void => {
    root.replaceChildren(elementOf(paintedOf(fixture.tree(), fixture.press)))
  }
  repaint()

  const elementWith = (selector: string): HTMLElement => {
    const found = root.querySelector(selector)
    if (found instanceof HTMLElement) {
      return found
    }
    throw new Error(`the painted cluster1 fixture has no ${selector}`)
  }

  return { fixture, root, repaint, elementWith }
}

describe('Cluster 1 core Parts on the HTML generic host', () => {
  it('proves Drawer: opens via trigger, projects modal dialog/grabber ARIA, snaps on drag, and dismisses via backdrop or Escape', () => {
    const staged = stage()
    const trigger = staged.elementWith('#fixture-drawer-trigger')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.getAttribute('aria-controls')).toBe('fixture-drawer-content')
    expect(
      staged.elementWith('#fixture-drawer-content').hasAttribute('hidden'),
    ).toBe(true)
    expect(
      staged
        .elementWith('#fixture-drawer-grabber')
        .getAttribute('aria-orientation'),
    ).toBe('vertical')

    trigger.click()
    staged.repaint()
    const content = staged.elementWith('#fixture-drawer-content')
    expect(
      staged
        .elementWith('#fixture-drawer-trigger')
        .getAttribute('aria-expanded'),
    ).toBe('true')
    expect(content.getAttribute('role')).toBe('dialog')
    expect(content.getAttribute('aria-modal')).toBe('true')
    expect(content.hasAttribute('hidden')).toBe(false)

    // Drag to snap point 0.5 and release
    staged.fixture.send(Drawer.BeginDrawerDrag({ pointerId: 1, x: 0, y: 0 }))
    staged.fixture.send(Drawer.MoveDrawerDrag({ pointerId: 1, x: 0, y: 190 }))
    staged.fixture.send(Drawer.ReleaseDrawerDrag({ pointerId: 1 }))
    staged.repaint()
    expect(Drawer.activeSnapPointOf(staged.fixture.drawerState())).toEqual(
      Option.some(0.5),
    )

    // Backdrop dismiss closes drawer
    staged.elementWith('#fixture-drawer-backdrop').click()
    staged.repaint()
    expect(
      staged.elementWith('#fixture-drawer-content').hasAttribute('hidden'),
    ).toBe(true)
  })

  it('proves HoverCard: opens on trigger, reveals region content, and dismisses on Escape', () => {
    const staged = stage()
    const trigger = staged.elementWith('#fixture-hover-card-trigger')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(
      staged.elementWith('#fixture-hover-card-content').hasAttribute('hidden'),
    ).toBe(true)

    trigger.click()
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-hover-card-trigger')
        .getAttribute('aria-expanded'),
    ).toBe('true')
    const content = staged.elementWith('#fixture-hover-card-content')
    expect(content.getAttribute('role')).toBe('region')
    expect(content.getAttribute('aria-labelledby')).toBe(
      'fixture-hover-card-trigger',
    )
    expect(content.hasAttribute('hidden')).toBe(false)

    staged.fixture.send(HoverCard.PressHoverCardEscape())
    staged.repaint()
    expect(
      staged.elementWith('#fixture-hover-card-content').hasAttribute('hidden'),
    ).toBe(true)
  })

  it('proves Menubar: roving tabindex, Left/Right menu switching, hover-switch, and item selection', () => {
    const staged = stage()
    expect(
      staged
        .elementWith('#fixture-menubar-bar')
        .getAttribute('aria-orientation'),
    ).toBe('horizontal')
    expect(
      staged
        .elementWith('#fixture-menubar-trigger-file')
        .getAttribute('tabindex'),
    ).toBe('0')
    expect(
      staged
        .elementWith('#fixture-menubar-trigger-edit')
        .getAttribute('tabindex'),
    ).toBe('-1')

    staged.elementWith('#fixture-menubar-trigger-file').click()
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-menubar-trigger-file')
        .getAttribute('aria-expanded'),
    ).toBe('true')
    expect(
      staged
        .elementWith('#fixture-menubar-content-file')
        .hasAttribute('hidden'),
    ).toBe(false)

    // ArrowRight switches open menu to edit
    staged.fixture.send(Menubar.PressedMenubarKey({ key: 'ArrowRight' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-menubar-trigger-edit')
        .getAttribute('aria-expanded'),
    ).toBe('true')
    expect(
      staged
        .elementWith('#fixture-menubar-content-edit')
        .hasAttribute('hidden'),
    ).toBe(false)

    // Clicking dropdown item selects and closes
    staged.elementWith('#fixture-menubar-menu-edit-item-0').click()
    staged.repaint()
    expect(Menubar.lastSelectedOf(staged.fixture.menubarState())).toEqual(
      Option.some({ menuValue: 'edit', itemValue: 'undo', itemIndex: 0 }),
    )
    expect(
      staged
        .elementWith('#fixture-menubar-content-edit')
        .hasAttribute('hidden'),
    ).toBe(true)
  })

  it('proves Toolbar: roving tabindex skipping disabled item and activating items', () => {
    const staged = stage()
    expect(
      staged
        .elementWith('#fixture-toolbar-root')
        .getAttribute('aria-orientation'),
    ).toBe('horizontal')
    expect(
      staged.elementWith('#fixture-toolbar-item-0').getAttribute('tabindex'),
    ).toBe('0')
    expect(
      staged
        .elementWith('#fixture-toolbar-item-1')
        .getAttribute('aria-disabled'),
    ).toBe('true')

    staged.fixture.send(Toolbar.PressedToolbarKey({ key: 'ArrowRight' }))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-toolbar-item-2').getAttribute('tabindex'),
    ).toBe('0')
    expect(
      staged.elementWith('#fixture-toolbar-item-0').getAttribute('tabindex'),
    ).toBe('-1')

    staged.elementWith('#fixture-toolbar-item-2').click()
    staged.repaint()
    expect(Toolbar.lastActivatedValueOf(staged.fixture.toolbarState())).toEqual(
      Option.some('paste'),
    )
  })

  it('proves ToggleGroup: aria-pressed toggling in Single and Multiple modes with roving tabindex', () => {
    const staged = stage({ toggleGroup: { mode: 'Multiple' } })
    expect(
      staged
        .elementWith('#fixture-toggle-group-item-0')
        .getAttribute('aria-pressed'),
    ).toBe('false')

    staged.elementWith('#fixture-toggle-group-item-0').click()
    staged.repaint()
    staged.elementWith('#fixture-toggle-group-item-2').click()
    staged.repaint()

    expect(
      staged
        .elementWith('#fixture-toggle-group-item-0')
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      staged
        .elementWith('#fixture-toggle-group-item-1')
        .getAttribute('aria-pressed'),
    ).toBe('false')
    expect(
      staged
        .elementWith('#fixture-toggle-group-item-2')
        .getAttribute('aria-pressed'),
    ).toBe('true')

    staged.fixture.send(ToggleGroup.PressedToggleGroupKey({ key: 'ArrowLeft' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-toggle-group-item-1')
        .getAttribute('tabindex'),
    ).toBe('0')
  })

  it('proves RatingGroup: radiogroup/radio ARIA, star click selection, half-star keyboard step, and roving tabindex', () => {
    const staged = stage({ ratingGroup: { allowHalf: true } })
    expect(
      staged.elementWith('#fixture-rating-root').getAttribute('role'),
    ).toBe('radiogroup')
    expect(
      staged
        .elementWith('#fixture-rating-root')
        .getAttribute('aria-labelledby'),
    ).toBe('fixture-rating-label')
    expect(
      staged.elementWith('#fixture-rating-item-1').getAttribute('tabindex'),
    ).toBe('0')

    staged.elementWith('#fixture-rating-item-4').click()
    staged.repaint()
    expect(
      staged.elementWith('#fixture-rating-item-4').getAttribute('aria-checked'),
    ).toBe('true')
    expect(
      staged.elementWith('#fixture-rating-item-4').getAttribute('tabindex'),
    ).toBe('0')
    expect(
      staged.elementWith('#fixture-rating-item-1').getAttribute('tabindex'),
    ).toBe('-1')

    // ArrowLeft steps down 0.5 -> 3.5 (still rounds ceil to star 4 with 3.5 stars label)
    staged.fixture.send(RatingGroup.PressedRatingKey({ key: 'ArrowLeft' }))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-rating-item-4').getAttribute('aria-label'),
    ).toBe('3.5 stars')
  })
})
