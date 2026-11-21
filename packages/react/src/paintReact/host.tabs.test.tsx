import { Option } from 'effect'
import { Tabs } from 'foldkit/behavior'
import { TabsFixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves the core Tabs Part on the React painter through the existing
// generic React host (`paintReact/host.tsx`), with zero Tabs-specific painter logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const stage = (overrides: Partial<Tabs.Props> = {}) => {
  const fixture = TabsFixture.start(overrides)
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
    throw new Error(`the painted tabs fixture has no ${selector}`)
  }
  return { fixture, repaint, elementWith }
}

describe('core Tabs Part on the React generic host', () => {
  it('paints tablist, tab, and tabpanel ARIA linkage and switches tabs via click and automatic keyboard roving', () => {
    const staged = stage()

    const tablist = staged.elementWith('#fixture-tabs-list')
    expect(tablist.getAttribute('role')).toBe('tablist')
    expect(tablist.getAttribute('aria-orientation')).toBe('horizontal')
    expect(tablist.getAttribute('aria-label')).toBe('Account sections')

    expect(staged.elementWith('#fixture-tabs-tab-0').getAttribute('role')).toBe(
      'tab',
    )
    expect(
      staged.elementWith('#fixture-tabs-tab-0').getAttribute('aria-selected'),
    ).toBe('true')
    expect(
      staged.elementWith('#fixture-tabs-tab-0').getAttribute('aria-controls'),
    ).toBe('fixture-tabs-panel-0')
    expect(staged.elementWith('#fixture-tabs-tab-0').tabIndex).toBe(0)
    expect(staged.elementWith('#fixture-tabs-tab-1').tabIndex).toBe(-1)
    expect(
      staged.elementWith('#fixture-tabs-tab-2').getAttribute('aria-disabled'),
    ).toBe('true')
    expect(staged.elementWith('#fixture-tabs-panel-0').hidden).toBe(false)
    expect(staged.elementWith('#fixture-tabs-panel-1').hidden).toBe(true)

    // Clicking Details selects it and reveals panel 1
    fireEvent.click(staged.elementWith('#fixture-tabs-tab-1'))
    staged.repaint()
    expect(
      Tabs.activeValueOf(staged.fixture.tabsState(), staged.fixture.props),
    ).toEqual(Option.some('details'))
    expect(
      staged.elementWith('#fixture-tabs-tab-1').getAttribute('aria-selected'),
    ).toBe('true')
    expect(staged.elementWith('#fixture-tabs-panel-1').hidden).toBe(false)
    expect(staged.elementWith('#fixture-tabs-panel-0').hidden).toBe(true)

    // ArrowRight skips disabled Billing -> activates Security
    staged.fixture.send(Tabs.PressedTabKey({ key: 'ArrowRight' }))
    staged.repaint()
    expect(
      Tabs.activeValueOf(staged.fixture.tabsState(), staged.fixture.props),
    ).toEqual(Option.some('security'))
    expect(
      staged.elementWith('#fixture-tabs-tab-3').getAttribute('aria-selected'),
    ).toBe('true')
    expect(staged.elementWith('#fixture-tabs-panel-3').hidden).toBe(false)
  })

  it('supports manual activation mode and vertical/RTL keyboard rules through the generic React host', () => {
    const manual = stage({ orientation: 'Vertical', activationMode: 'Manual' })
    expect(
      manual.elementWith('#fixture-tabs-list').getAttribute('aria-orientation'),
    ).toBe('vertical')

    manual.fixture.send(Tabs.PressedTabKey({ key: 'ArrowDown' }))
    manual.repaint()
    expect(
      manual.elementWith('#fixture-tabs-tab-0').getAttribute('aria-selected'),
    ).toBe('true')
    expect(manual.elementWith('#fixture-tabs-tab-0').tabIndex).toBe(-1)
    expect(manual.elementWith('#fixture-tabs-tab-1').tabIndex).toBe(0)
    expect(manual.elementWith('#fixture-tabs-panel-0').hidden).toBe(false)

    manual.fixture.send(Tabs.PressedTabKey({ key: ' ' }))
    manual.repaint()
    expect(
      manual.elementWith('#fixture-tabs-tab-1').getAttribute('aria-selected'),
    ).toBe('true')
    expect(manual.elementWith('#fixture-tabs-panel-1').hidden).toBe(false)

    const rtl = stage({ direction: 'Rtl' })
    rtl.fixture.send(Tabs.PressedTabKey({ key: 'ArrowLeft' }))
    rtl.repaint()
    expect(
      Tabs.activeValueOf(rtl.fixture.tabsState(), rtl.fixture.props),
    ).toEqual(Option.some('details'))
  })
})
