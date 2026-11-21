import { Option } from 'effect'
import { Host, LongPress, Menu, Typeahead } from 'foldkit/behavior'
import { MenuFixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves the core Menu Part on the React painter through the existing
// generic React host (`paintReact/host.tsx`), with zero Menu-specific painter logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const tick = (): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, 5)
  })

const stage = () => {
  const fixture = MenuFixture.start()
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
    throw new Error(`the painted menu fixture has no ${selector}`)
  }
  const elapse = async (ms: number): Promise<void> => {
    await fixture.elapse(ms)
    repaint()
    await tick()
    repaint()
  }
  return {
    fixture,
    repaint,
    elapse,
    elementWith,
    row: () => elementWith('li.fk-item[data-key="salt-road"]'),
    trigger: () => elementWith('#fixture-menu-button'),
  }
}

const touch = { pointerType: 'touch', clientX: 10, clientY: 10 }

describe('core Menu Part on the React generic host', () => {
  it.each(Host.personActs)(
    '%s on a row opens the core Menu Part on that target',
    async personAct => {
      const staged = stage()
      if (personAct === 'Hold') {
        fireEvent.pointerDown(staged.row(), touch)
        staged.repaint()
        await staged.elapse(LongPress.holdMs)
        fireEvent.pointerUp(staged.row(), touch)
        staged.repaint()
      } else {
        fireEvent.contextMenu(staged.row())
        staged.repaint()
      }
      expect(Menu.isOpen(staged.fixture.menuState())).toBe(true)
      expect(Menu.targetOf(staged.fixture.menuState())).toEqual(
        Option.some('salt-road'),
      )
    },
  )

  it('toggles open, roves, searches with typeahead, selects an item, and dismisses through generic React host', async () => {
    const staged = stage()

    expect(staged.trigger().getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(staged.trigger())
    staged.repaint()

    expect(Menu.isOpen(staged.fixture.menuState())).toBe(true)
    expect(staged.trigger().getAttribute('aria-expanded')).toBe('true')

    // Roving highlight + typeahead reflected in painted ARIA
    staged.fixture.send(Menu.PressedMenuKey({ key: 'ArrowDown' }))
    staged.fixture.send(Menu.PressedMenuKey({ key: 'd' }))
    staged.fixture.send(Menu.PressedMenuKey({ key: 'e' }))
    staged.repaint()
    expect(Menu.activeIndexOf(staged.fixture.menuState())).toEqual(
      Option.some(3),
    )
    expect(
      staged.elementWith('#fixture-menu-item-3').getAttribute('aria-current'),
    ).toBe('true')

    await staged.elapse(Typeahead.resetMs)
    expect(Menu.searchQueryOf(staged.fixture.menuState())).toBe('')

    // Clicking the menu item selects it and closes the menu
    fireEvent.click(staged.elementWith('#fixture-menu-item-3'))
    staged.repaint()
    expect(Menu.isOpen(staged.fixture.menuState())).toBe(false)
    expect(Menu.lastSelectedOf(staged.fixture.menuState())).toEqual(
      Option.some({ value: 'delete', index: 3 }),
    )

    // Reopen and dismiss via Escape / outside press
    fireEvent.click(staged.trigger())
    staged.repaint()
    expect(Menu.isOpen(staged.fixture.menuState())).toBe(true)
    staged.fixture.send(Menu.PressedOutsideMenu({ insideIds: [] }))
    staged.repaint()
    expect(Menu.isOpen(staged.fixture.menuState())).toBe(false)
  })
})
