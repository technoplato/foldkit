import { Array, Context, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

import * as CascadeSelect from '../behavior/cascadeSelect.js'
import * as NumberInput from '../behavior/numberInput.js'
import * as Pagination from '../behavior/pagination.js'
import * as PinInput from '../behavior/pinInput.js'
import * as TagsInput from '../behavior/tagsInput.js'
import * as TreeView from '../behavior/treeView.js'
import {
  __clearRuntime as clearHtmlRuntime,
  __setRuntime as setHtmlRuntime,
} from '../html/index.js'
import * as Cluster2Fixture from '../test/cluster2Fixture.js'
import { paintHtml } from './html.js'
import type { UiNode } from './types.js'

// NOTE: proves all 6 Zag/Radix Cluster 2 core Parts (NumberInput, PinInput,
// TagsInput, CascadeSelect, TreeView, Pagination) on the HTML painter through
// the existing generic `htmlHost` (`slotAttributesOf`), with zero
// widget-specific painter logic.

type Vnode = Readonly<{
  sel?: string
  data?: Readonly<{
    attrs?: Readonly<Record<string, string | number | boolean>>
    props?: Readonly<Record<string, unknown>>
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
  if (
    element instanceof HTMLInputElement &&
    typeof node.data?.props?.['value'] === 'string'
  ) {
    element.value = node.data.props['value']
  }
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
  const inputHandler = node.data?.on?.['input']
  if (typeof inputHandler === 'function') {
    element.addEventListener('input', event => {
      inputHandler(event)
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

const stage = (overrides: Cluster2Fixture.FixtureOverrides = {}) => {
  const fixture = Cluster2Fixture.start(overrides)
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
    throw new Error(`the painted cluster2 fixture has no ${selector}`)
  }

  return { fixture, root, repaint, elementWith }
}

describe('Cluster 2 core Parts on the HTML generic host', () => {
  it('proves NumberInput ARIA, button stepping, typing, and scrubbing', () => {
    const staged = stage()
    const input = staged.elementWith('#c2-number-input')
    expect(input.getAttribute('role')).toBe('textbox')
    expect(input.getAttribute('aria-valuemin')).toBe('0')
    expect(input.getAttribute('aria-valuemax')).toBe('100')
    expect(input.getAttribute('aria-valuenow')).toBe('20')
    expect(input.getAttribute('aria-valuetext')).toBe('20')
    expect(staged.elementWith('#c2-number-scrubber').getAttribute('role')).toBe(
      'slider',
    )

    staged.elementWith('#c2-number-increment').click()
    staged.repaint()
    expect(
      staged.elementWith('#c2-number-input').getAttribute('aria-valuenow'),
    ).toBe('25')

    const field = staged.elementWith('#c2-number-input')
    if (field instanceof HTMLInputElement) {
      field.value = '60'
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }
    staged.fixture.send(NumberInput.CommitNumberInput())
    staged.repaint()
    expect(
      staged.elementWith('#c2-number-input').getAttribute('aria-valuenow'),
    ).toBe('60')

    staged.fixture.send(NumberInput.BeginScrub({ pointerId: 1, x: 100, y: 0 }))
    staged.fixture.send(NumberInput.MoveScrub({ pointerId: 1, x: 108, y: 0 }))
    staged.fixture.send(NumberInput.EndScrub({ pointerId: 1 }))
    staged.repaint()
    expect(
      staged.elementWith('#c2-number-input').getAttribute('aria-valuenow'),
    ).toBe('70')
  })

  it('proves PinInput slot entry, auto-advance, paste, and roving tabIndex', () => {
    const staged = stage()
    expect(staged.elementWith('#c2-pin-root').getAttribute('role')).toBe(
      'group',
    )
    expect(staged.elementWith('#c2-pin-input-0').getAttribute('tabindex')).toBe(
      '0',
    )
    expect(staged.elementWith('#c2-pin-input-1').getAttribute('tabindex')).toBe(
      '-1',
    )

    const slot0 = staged.elementWith('#c2-pin-input-0')
    if (slot0 instanceof HTMLInputElement) {
      slot0.value = '7'
      slot0.dispatchEvent(new Event('input', { bubbles: true }))
    }
    staged.repaint()
    expect(PinInput.slotValueAt(staged.fixture.pinState(), 0)).toBe('7')
    expect(staged.elementWith('#c2-pin-input-1').getAttribute('tabindex')).toBe(
      '0',
    )
    expect(
      staged.elementWith('#c2-pin-input-1').getAttribute('aria-current'),
    ).toBe('true')

    staged.fixture.send(PinInput.PastePin({ value: '4815', startIndex: 0 }))
    staged.repaint()
    expect(
      PinInput.isCompleteOf(
        staged.fixture.pinState(),
        staged.fixture.props.pinInput,
      ),
    ).toBe(true)
    expect(PinInput.valueOf(staged.fixture.pinState())).toBe('4815')
  })

  it('proves TagsInput delimiter entry, highlight, delete, and clear', () => {
    const staged = stage()
    expect(staged.elementWith('#c2-tags-root').getAttribute('role')).toBe(
      'group',
    )
    expect(staged.elementWith('#c2-tags-tag-0').getAttribute('role')).toBe(
      'option',
    )

    const tagsInput = staged.elementWith('#c2-tags-input')
    if (tagsInput instanceof HTMLInputElement) {
      tagsInput.value = 'effect,'
      tagsInput.dispatchEvent(new Event('input', { bubbles: true }))
    }
    staged.repaint()
    expect(TagsInput.tagsOf(staged.fixture.tagsState())).toEqual([
      'foldkit',
      'effect',
    ])

    staged.elementWith('#c2-tags-tag-1').click()
    staged.repaint()
    expect(
      staged.elementWith('#c2-tags-tag-1').getAttribute('aria-current'),
    ).toBe('true')

    staged.elementWith('#c2-tags-tag-delete-0').click()
    staged.repaint()
    expect(TagsInput.tagsOf(staged.fixture.tagsState())).toEqual(['effect'])

    staged.elementWith('#c2-tags-clear').click()
    staged.repaint()
    expect(TagsInput.isEmpty(staged.fixture.tagsState())).toBe(true)
    expect(staged.elementWith('#c2-tags-clear').hasAttribute('hidden')).toBe(
      true,
    )
  })

  it('proves CascadeSelect multi-column expansion, leaf selection, and clear', () => {
    const staged = stage()
    const trigger = staged.elementWith('#c2-cascade-trigger')
    expect(trigger.getAttribute('role')).toBe('combobox')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(
      staged.elementWith('#c2-cascade-content').hasAttribute('hidden'),
    ).toBe(true)

    trigger.click()
    staged.repaint()
    expect(
      staged.elementWith('#c2-cascade-trigger').getAttribute('aria-expanded'),
    ).toBe('true')
    expect(
      staged.elementWith('#c2-cascade-column-1').hasAttribute('hidden'),
    ).toBe(false)

    // Descend to California -> San Francisco and select leaf
    staged.elementWith('#c2-cascade-option-ca').click()
    staged.repaint()
    staged.elementWith('#c2-cascade-option-sf').click()
    staged.repaint()
    expect(CascadeSelect.isClosed(staged.fixture.cascadeState())).toBe(true)
    expect(
      CascadeSelect.breadcrumbOf(
        staged.fixture.cascadeState(),
        staged.fixture.props.cascadeSelect,
      ),
    ).toBe('United States / California / San Francisco')

    staged.elementWith('#c2-cascade-clear').click()
    staged.repaint()
    expect(CascadeSelect.isSelectionEmpty(staged.fixture.cascadeState())).toBe(
      true,
    )
  })

  it('proves TreeView branch expansion, item selection, and ARIA projections', () => {
    const staged = stage()
    expect(staged.elementWith('#c2-tree-tree').getAttribute('role')).toBe(
      'listbox',
    )
    expect(
      staged.elementWith('#c2-tree-item-src').getAttribute('aria-expanded'),
    ).toBe('false')

    staged.elementWith('#c2-tree-toggle-src').click()
    staged.repaint()
    expect(
      staged.elementWith('#c2-tree-item-src').getAttribute('aria-expanded'),
    ).toBe('true')
    expect(
      staged.elementWith('#c2-tree-toggle-src').getAttribute('aria-expanded'),
    ).toBe('true')

    staged.elementWith('#c2-tree-item-index').click()
    staged.repaint()
    expect(
      staged.elementWith('#c2-tree-item-index').getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      staged.elementWith('#c2-tree-item-index').getAttribute('aria-current'),
    ).toBe('true')
    expect(TreeView.selectedIdsOf(staged.fixture.treeState())).toEqual([
      'index',
    ])
  })

  it('proves Pagination page buttons, ellipsis, next/prev navigation, and current ARIA', () => {
    const staged = stage()
    expect(staged.elementWith('#c2-pagination-root').getAttribute('role')).toBe(
      'region',
    )
    expect(
      staged.elementWith('#c2-pagination-prev').getAttribute('aria-disabled'),
    ).toBe('true')
    expect(
      staged.elementWith('#c2-pagination-page-1').getAttribute('aria-current'),
    ).toBe('true')
    expect(staged.elementWith('#c2-pagination-ellipsis-end').id).toBe(
      'c2-pagination-ellipsis-end',
    )

    staged.elementWith('#c2-pagination-next').click()
    staged.repaint()
    expect(staged.fixture.paginationState().page).toBe(2)
    expect(
      staged.elementWith('#c2-pagination-page-2').getAttribute('aria-current'),
    ).toBe('true')
    expect(
      staged.elementWith('#c2-pagination-prev').getAttribute('aria-disabled'),
    ).toBe('false')

    staged.elementWith('#c2-pagination-page-10').click()
    staged.repaint()
    expect(staged.fixture.paginationState().page).toBe(10)
    expect(
      staged.elementWith('#c2-pagination-next').getAttribute('aria-disabled'),
    ).toBe('true')
    expect(
      Pagination.sliceRangeOf(
        staged.fixture.paginationState(),
        staged.fixture.props.pagination,
      ),
    ).toEqual({ startIndex: 90, endIndex: 100 })
  })
})
