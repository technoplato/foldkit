import { Option } from 'effect'
import {
  Drawer,
  HoverCard,
  Menubar,
  RatingGroup,
  ToggleGroup,
  Toolbar,
} from 'foldkit/behavior'
import { Cluster1Fixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves all 6 Cluster 1 core Parts (Drawer, HoverCard, Menubar,
// Toolbar, ToggleGroup, RatingGroup) on the React painter through the existing
// generic React host (`paintReact/host.tsx`), with zero widget-specific
// painter logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const stage = (overrides: Cluster1Fixture.FixtureOverrides = {}) => {
  const fixture = Cluster1Fixture.start(overrides)
  const painted = () =>
    paintTree(fixture.tree(), {
      onPress: button => {
        const tag = button.action ?? button.token
        if (tag !== undefined) {
          fixture.press(tag)
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
    throw new Error(`the painted cluster1 fixture has no ${selector}`)
  }
  return { fixture, repaint, elementWith }
}

describe('Cluster 1 core Parts on the React generic host', () => {
  it('proves Drawer: opens, projects dialog/grabber ARIA, drags to dismiss, and closes via button', () => {
    const staged = stage()
    fireEvent.click(staged.elementWith('#fixture-drawer-trigger'))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-drawer-trigger')
        .getAttribute('aria-expanded'),
    ).toBe('true')
    expect(
      staged.elementWith('#fixture-drawer-content').getAttribute('role'),
    ).toBe('dialog')
    expect(
      staged.elementWith('#fixture-drawer-content').hasAttribute('hidden'),
    ).toBe(false)

    // Swipe fast to dismiss
    staged.fixture.send(Drawer.BeginDrawerDrag({ pointerId: 1, x: 0, y: 0 }))
    staged.fixture.send(Drawer.MoveDrawerDrag({ pointerId: 1, x: 0, y: 310 }))
    staged.fixture.send(
      Drawer.ReleaseDrawerDrag({ pointerId: 1, velocityPxPerSec: 600 }),
    )
    staged.repaint()
    expect(Drawer.isOpen(staged.fixture.drawerState())).toBe(false)
    expect(
      staged.elementWith('#fixture-drawer-content').hasAttribute('hidden'),
    ).toBe(true)
  })

  it('proves HoverCard: opens on trigger, reveals region content, and dismisses on Escape', () => {
    const staged = stage()
    fireEvent.click(staged.elementWith('#fixture-hover-card-trigger'))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-hover-card-trigger')
        .getAttribute('aria-expanded'),
    ).toBe('true')
    expect(
      staged.elementWith('#fixture-hover-card-content').getAttribute('role'),
    ).toBe('region')
    expect(
      staged.elementWith('#fixture-hover-card-content').hasAttribute('hidden'),
    ).toBe(false)

    staged.fixture.send(HoverCard.PressHoverCardEscape())
    staged.repaint()
    expect(
      staged.elementWith('#fixture-hover-card-content').hasAttribute('hidden'),
    ).toBe(true)
  })

  it('proves Menubar: opens top-level menu, hover-switches to Edit, and selects an item', () => {
    const staged = stage()
    fireEvent.click(staged.elementWith('#fixture-menubar-trigger-file'))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-menubar-content-file')
        .hasAttribute('hidden'),
    ).toBe(false)

    staged.fixture.send(Menubar.HoverMenubarTrigger({ menuValue: 'edit' }))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-menubar-content-edit')
        .hasAttribute('hidden'),
    ).toBe(false)

    fireEvent.click(staged.elementWith('#fixture-menubar-menu-edit-item-1'))
    staged.repaint()
    expect(Menubar.lastSelectedOf(staged.fixture.menubarState())).toEqual(
      Option.some({ menuValue: 'edit', itemValue: 'redo', itemIndex: 1 }),
    )
  })

  it('proves Toolbar: roving focus skips disabled item and activates via click', () => {
    const staged = stage()
    staged.fixture.send(Toolbar.PressedToolbarKey({ key: 'ArrowRight' }))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-toolbar-item-2').getAttribute('tabindex'),
    ).toBe('0')

    fireEvent.click(staged.elementWith('#fixture-toolbar-item-0'))
    staged.repaint()
    expect(Toolbar.lastActivatedValueOf(staged.fixture.toolbarState())).toEqual(
      Option.some('cut'),
    )
  })

  it('proves ToggleGroup: toggles aria-pressed and enforces deselectable: false', () => {
    const staged = stage({ toggleGroup: { deselectable: false } })
    fireEvent.click(staged.elementWith('#fixture-toggle-group-item-1'))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-toggle-group-item-1')
        .getAttribute('aria-pressed'),
    ).toBe('true')

    // Second click cannot deselect when deselectable is false
    fireEvent.click(staged.elementWith('#fixture-toggle-group-item-1'))
    staged.repaint()
    expect(
      staged
        .elementWith('#fixture-toggle-group-item-1')
        .getAttribute('aria-pressed'),
    ).toBe('true')
    expect(ToggleGroup.valuesOf(staged.fixture.toggleGroupState())).toEqual([
      'center',
    ])
  })

  it('proves RatingGroup: clicks stars, supports hover preview, and selects via digit key', () => {
    const staged = stage()
    fireEvent.click(staged.elementWith('#fixture-rating-item-3'))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-rating-item-3').getAttribute('aria-checked'),
    ).toBe('true')

    staged.fixture.send(RatingGroup.PressedRatingKey({ key: '5' }))
    staged.repaint()
    expect(
      staged.elementWith('#fixture-rating-item-5').getAttribute('aria-checked'),
    ).toBe('true')
    expect(RatingGroup.valueOf(staged.fixture.ratingGroupState())).toBe(5)
  })
})
