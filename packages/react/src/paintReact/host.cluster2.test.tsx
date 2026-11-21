import {
  CascadeSelect,
  NumberInput,
  PinInput,
  TagsInput,
  TreeView,
} from 'foldkit/behavior'
import { Cluster2Fixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves all 6 Zag/Radix Cluster 2 core Parts (NumberInput, PinInput,
// TagsInput, CascadeSelect, TreeView, Pagination) on the React painter through
// the existing generic React host (`paintReact/host.tsx`), with zero
// widget-specific painter logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const stage = (overrides: Cluster2Fixture.FixtureOverrides = {}) => {
  const fixture = Cluster2Fixture.start(overrides)
  const painted = () =>
    paintTree(fixture.tree(), {
      onPress: button => {
        const tag = button.action ?? button.token
        if (tag !== undefined) {
          fixture.press(tag)
        }
      },
      onInput: (token, value) => {
        fixture.type(token, value)
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
    throw new Error(`the painted cluster2 fixture has no ${selector}`)
  }
  return { fixture, repaint, elementWith }
}

describe('Cluster 2 core Parts on the React generic host', () => {
  it('proves NumberInput, PinInput, and TagsInput through generic slot props', () => {
    const staged = stage()

    // NumberInput
    const numInput = staged.elementWith('#c2-number-input')
    expect(numInput.getAttribute('aria-valuemin')).toBe('0')
    expect(numInput.getAttribute('aria-valuemax')).toBe('100')
    expect(numInput.getAttribute('aria-valuenow')).toBe('20')
    fireEvent.click(staged.elementWith('#c2-number-increment'))
    staged.repaint()
    expect(
      staged.elementWith('#c2-number-input').getAttribute('aria-valuenow'),
    ).toBe('25')
    fireEvent.change(staged.elementWith('#c2-number-input'), {
      target: { value: '80' },
    })
    staged.fixture.send(NumberInput.CommitNumberInput())
    staged.repaint()
    expect(
      staged.elementWith('#c2-number-input').getAttribute('aria-valuenow'),
    ).toBe('80')

    // PinInput
    expect(staged.elementWith('#c2-pin-root').getAttribute('role')).toBe(
      'group',
    )
    fireEvent.change(staged.elementWith('#c2-pin-input-0'), {
      target: { value: '9' },
    })
    staged.repaint()
    expect(PinInput.slotValueAt(staged.fixture.pinState(), 0)).toBe('9')
    expect(
      staged.elementWith('#c2-pin-input-1').getAttribute('aria-current'),
    ).toBe('true')
    staged.fixture.send(PinInput.PastePin({ value: '1357', startIndex: 0 }))
    staged.repaint()
    expect(
      PinInput.isCompleteOf(
        staged.fixture.pinState(),
        staged.fixture.props.pinInput,
      ),
    ).toBe(true)

    // TagsInput
    fireEvent.change(staged.elementWith('#c2-tags-input'), {
      target: { value: 'react,' },
    })
    staged.repaint()
    expect(TagsInput.tagsOf(staged.fixture.tagsState())).toEqual([
      'foldkit',
      'react',
    ])
    fireEvent.click(staged.elementWith('#c2-tags-tag-delete-0'))
    staged.repaint()
    expect(TagsInput.tagsOf(staged.fixture.tagsState())).toEqual(['react'])
  })

  it('proves CascadeSelect, TreeView, and Pagination through generic slot props', () => {
    const staged = stage()

    // CascadeSelect
    fireEvent.click(staged.elementWith('#c2-cascade-trigger'))
    staged.repaint()
    expect(
      staged.elementWith('#c2-cascade-trigger').getAttribute('aria-expanded'),
    ).toBe('true')
    fireEvent.click(staged.elementWith('#c2-cascade-option-ca'))
    staged.repaint()
    fireEvent.click(staged.elementWith('#c2-cascade-option-la'))
    staged.repaint()
    expect(CascadeSelect.selectedIdsOf(staged.fixture.cascadeState())).toEqual([
      'la',
    ])
    expect(
      CascadeSelect.breadcrumbOf(
        staged.fixture.cascadeState(),
        staged.fixture.props.cascadeSelect,
      ),
    ).toBe('United States / California / Los Angeles')

    // TreeView
    fireEvent.click(staged.elementWith('#c2-tree-toggle-src'))
    staged.repaint()
    expect(
      staged.elementWith('#c2-tree-item-src').getAttribute('aria-expanded'),
    ).toBe('true')
    fireEvent.click(staged.elementWith('#c2-tree-item-app'))
    staged.repaint()
    expect(TreeView.selectedIdsOf(staged.fixture.treeState())).toEqual(['app'])
    expect(
      staged.elementWith('#c2-tree-item-app').getAttribute('aria-selected'),
    ).toBe('true')

    // Pagination
    expect(
      staged.elementWith('#c2-pagination-page-1').getAttribute('aria-current'),
    ).toBe('true')
    fireEvent.click(staged.elementWith('#c2-pagination-next'))
    staged.repaint()
    expect(staged.fixture.paginationState().page).toBe(2)
    expect(
      staged.elementWith('#c2-pagination-page-2').getAttribute('aria-current'),
    ).toBe('true')
    fireEvent.click(staged.elementWith('#c2-pagination-page-10'))
    staged.repaint()
    expect(staged.fixture.paginationState().page).toBe(10)
    expect(
      staged.elementWith('#c2-pagination-next').getAttribute('aria-disabled'),
    ).toBe('true')
  })
})
