import { Array, Context, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as FileDrop from '../behavior/fileDrop.js'
import * as Nav from '../behavior/nav.js'
import * as Presence from '../behavior/presence.js'
import * as VirtualList from '../behavior/virtualList.js'
import {
  __clearRuntime as clearHtmlRuntime,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import * as FileDropFixture from '../test/fileDropFixture.js'
import * as NavFixture from '../test/navFixture.js'
import * as PresenceFixture from '../test/presenceFixture.js'
import * as VirtualListFixture from '../test/virtualListFixture.js'
import type { VNode } from '../vdom.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves the final four packages/ui core Parts (Nav #2659, FileDrop
// #2662, VirtualList #2663, and Presence #2664) on the HTML painter through
// the existing generic `htmlHost` (`slotAttributesOf`), with zero
// widget-specific painter logic.

const paintedOf = (
  tree: UiNode,
  onAction: (tag: string) => void,
): VNode | null => {
  setHtmlRuntime(message => {
    if (typeof message === 'string') {
      onAction(message)
    }
  }, Context.empty())
  try {
    return paintHtml(tree, tag => tag)
  } finally {
    clearHtmlRuntime()
  }
}

const elementOf = (node: VNode | null): HTMLElement => {
  if (node === null) {
    return document.createElement('div')
  }
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
      clickHandler(event, node)
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

const mountStage = <
  Fixture extends Readonly<{
    tree: () => UiNode
    press: (tag: string) => void
  }>,
>(
  fixture: Fixture,
  label: string,
) => {
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
    throw new Error(`the painted ${label} fixture has no ${selector}`)
  }

  return { fixture, root, repaint, elementWith }
}

describe('final four core Parts on the HTML generic host', () => {
  describe('Nav Part (#2659)', () => {
    it('projects Nav, Trigger, Link, and Content ARIA across toggle, hover-switch, and Escape dismiss', () => {
      const staged = mountStage(NavFixture.start(), 'nav')

      const nav = staged.elementWith('#fixture-nav-nav')
      const dashboard = staged.elementWith('#fixture-nav-link-dashboard')
      const productsTrigger = staged.elementWith(
        '#fixture-nav-trigger-products',
      )
      const productsContent = staged.elementWith(
        '#fixture-nav-content-products',
      )
      const disabledTrigger = staged.elementWith(
        '#fixture-nav-trigger-disabled',
      )

      expect(nav.getAttribute('role')).toBe('region')
      expect(nav.getAttribute('aria-orientation')).toBe('horizontal')
      expect(nav.getAttribute('aria-label')).toBe('Main navigation')

      expect(dashboard.getAttribute('role')).toBe('menuitem')
      expect(dashboard.getAttribute('aria-current')).toBe('true')
      expect(productsTrigger.getAttribute('aria-expanded')).toBe('false')
      expect(productsTrigger.getAttribute('aria-controls')).toBe(
        'fixture-nav-content-products',
      )
      expect(productsTrigger.getAttribute('aria-haspopup')).toBe('menu')
      expect(productsContent.hasAttribute('hidden')).toBe(true)
      expect(disabledTrigger.getAttribute('aria-disabled')).toBe('true')

      productsTrigger.click()
      staged.repaint()

      expect(
        staged
          .elementWith('#fixture-nav-trigger-products')
          .getAttribute('aria-expanded'),
      ).toBe('true')
      expect(
        staged
          .elementWith('#fixture-nav-content-products')
          .hasAttribute('hidden'),
      ).toBe(false)

      staged.fixture.send(Nav.EnterNavTrigger({ value: 'resources' }))
      staged.repaint()

      expect(
        staged
          .elementWith('#fixture-nav-trigger-products')
          .getAttribute('aria-expanded'),
      ).toBe('false')
      expect(
        staged
          .elementWith('#fixture-nav-trigger-resources')
          .getAttribute('aria-expanded'),
      ).toBe('true')
      expect(
        staged
          .elementWith('#fixture-nav-content-resources')
          .hasAttribute('hidden'),
      ).toBe(false)

      staged.fixture.send(Nav.PressedNavKey({ key: 'Escape' }))
      staged.repaint()

      expect(
        staged
          .elementWith('#fixture-nav-trigger-resources')
          .getAttribute('aria-expanded'),
      ).toBe('false')
      expect(
        staged
          .elementWith('#fixture-nav-content-resources')
          .hasAttribute('hidden'),
      ).toBe(true)
    })
  })

  describe('FileDrop Part (#2662)', () => {
    it('projects Dropzone, Trigger, Item, RemoveButton, and ClearButton ARIA across drag depth, validation, remove, and clear', () => {
      const staged = mountStage(FileDropFixture.start(), 'fileDrop')

      const dropzone = staged.elementWith('#fixture-file-drop-dropzone')
      const clearButton = staged.elementWith('#fixture-file-drop-clear')
      expect(dropzone.getAttribute('role')).toBe('region')
      expect(dropzone.getAttribute('aria-label')).toBe('Upload documents')
      expect(dropzone.getAttribute('aria-current')).toBe('false')
      expect(clearButton.getAttribute('aria-disabled')).toBe('true')

      staged.fixture.send(FileDrop.EnterDragZone())
      staged.fixture.send(FileDrop.EnterDragZone())
      staged.fixture.send(FileDrop.LeaveDragZone())
      staged.repaint()
      expect(
        staged
          .elementWith('#fixture-file-drop-dropzone')
          .getAttribute('aria-current'),
      ).toBe('true')

      staged.fixture.send(
        FileDrop.DropFiles({
          files: [
            { name: 'resume.pdf', size: 1200, type: 'application/pdf' },
            {
              name: 'malware.exe',
              size: 1200,
              type: 'application/octet-stream',
            },
          ],
        }),
      )
      staged.repaint()

      expect(
        staged
          .elementWith('#fixture-file-drop-dropzone')
          .getAttribute('aria-current'),
      ).toBe('false')
      expect(
        staged
          .elementWith('#fixture-file-drop-dropzone')
          .getAttribute('aria-invalid'),
      ).toBe('true')
      expect(
        staged
          .elementWith('#fixture-file-drop-item-resume\\.pdf')
          .getAttribute('role'),
      ).toBe('group')

      staged.elementWith('#fixture-file-drop-remove-resume\\.pdf').click()
      staged.repaint()
      expect(
        staged.root.querySelector('#fixture-file-drop-item-resume\\.pdf'),
      ).toBeNull()

      staged.elementWith('#fixture-file-drop-clear').click()
      staged.repaint()
      expect(
        staged
          .elementWith('#fixture-file-drop-dropzone')
          .getAttribute('aria-invalid'),
      ).toBeNull()
    })
  })

  describe('VirtualList Part (#2663)', () => {
    it('projects Viewport, Content, and Item ARIA across measurement, window slicing, and ScrollToIndex', () => {
      const staged = mountStage(VirtualListFixture.start(), 'virtualList')

      const viewport = staged.elementWith('#fixture-virtual-list-viewport')
      const content = staged.elementWith('#fixture-virtual-list-content')
      expect(viewport.getAttribute('role')).toBe('region')
      expect(viewport.getAttribute('aria-valuemax')).toBe('3000')
      expect(viewport.getAttribute('aria-valuenow')).toBe('0')
      expect(content.getAttribute('role')).toBe('listbox')
      expect(content.hasAttribute('hidden')).toBe(true)

      staged.fixture.send(VirtualList.MeasuredViewport({ containerHeight: 90 }))
      staged.repaint()

      expect(
        staged
          .elementWith('#fixture-virtual-list-content')
          .hasAttribute('hidden'),
      ).toBe(false)
      expect(
        staged.elementWith('#fixture-virtual-list-item-0').getAttribute('role'),
      ).toBe('option')
      expect(
        staged.root.querySelector('#fixture-virtual-list-item-2'),
      ).not.toBeNull()
      expect(
        staged.root.querySelector('#fixture-virtual-list-item-3'),
      ).toBeNull()

      staged.fixture.send(
        VirtualList.ScrollToIndex({ index: 20, align: 'Start' }),
      )
      staged.repaint()

      expect(
        staged
          .elementWith('#fixture-virtual-list-viewport')
          .getAttribute('aria-valuenow'),
      ).toBe('600')
      expect(
        staged
          .elementWith('#fixture-virtual-list-item-20')
          .getAttribute('aria-current'),
      ).toBe('true')

      staged.fixture.send(VirtualList.CompletedApplyScroll({ version: 1 }))
      staged.repaint()

      expect(
        staged
          .elementWith('#fixture-virtual-list-item-20')
          .getAttribute('aria-current'),
      ).toBe('false')
    })
  })

  describe('Presence Part (#2664)', () => {
    it('projects Container, ShowTrigger, and HideTrigger ARIA through enter and leave animation phases', () => {
      const staged = mountStage(PresenceFixture.start(), 'presence')

      const container = staged.elementWith('#fixture-presence-container')
      const showTrigger = staged.elementWith('#fixture-presence-show')
      expect(container.getAttribute('role')).toBe('region')
      expect(container.getAttribute('aria-expanded')).toBe('false')
      expect(container.hasAttribute('hidden')).toBe(true)
      expect(showTrigger.getAttribute('aria-controls')).toBe(
        'fixture-presence-container',
      )

      showTrigger.click()
      staged.repaint()
      expect(
        staged
          .elementWith('#fixture-presence-container')
          .getAttribute('aria-expanded'),
      ).toBe('true')
      expect(
        staged
          .elementWith('#fixture-presence-container')
          .hasAttribute('hidden'),
      ).toBe(false)

      staged.fixture.send(Presence.AdvanceFrame())
      staged.fixture.send(Presence.EndAnimation())
      staged.repaint()
      expect(staged.fixture.presenceState()).toEqual(Presence.Open())

      staged.elementWith('#fixture-presence-hide').click()
      staged.fixture.send(Presence.AdvanceFrame())
      staged.repaint()
      expect(
        staged
          .elementWith('#fixture-presence-container')
          .getAttribute('aria-expanded'),
      ).toBe('false')
      expect(
        staged
          .elementWith('#fixture-presence-container')
          .hasAttribute('hidden'),
      ).toBe(false)

      staged.fixture.send(Presence.EndAnimation())
      staged.repaint()
      expect(
        staged
          .elementWith('#fixture-presence-container')
          .hasAttribute('hidden'),
      ).toBe(true)
    })
  })
})
