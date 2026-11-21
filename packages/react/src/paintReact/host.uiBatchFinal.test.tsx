import { FileDrop, Nav, Presence, VirtualList } from 'foldkit/behavior'
import type { UiNode } from 'foldkit/renderers'
import {
  FileDropFixture,
  NavFixture,
  PresenceFixture,
  VirtualListFixture,
} from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves the final four packages/ui core Parts (Nav #2659, FileDrop
// #2662, VirtualList #2663, and Presence #2664) on the React painter through
// the existing generic React host (`paintReact/host.tsx`), with zero
// widget-specific painter logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
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
    throw new Error(`the painted ${label} fixture has no ${selector}`)
  }
  return { fixture, container: view.container, repaint, elementWith }
}

describe('final four core Parts on the React generic host', () => {
  describe('Nav Part (#2659)', () => {
    it('projects Nav, Trigger, Link, and Content ARIA across toggle, hover-switch, and Escape dismiss', () => {
      const staged = mountStage(NavFixture.start(), 'nav')

      expect(
        staged.elementWith('#fixture-nav-nav').getAttribute('aria-orientation'),
      ).toBe('horizontal')
      expect(
        staged
          .elementWith('#fixture-nav-link-dashboard')
          .getAttribute('aria-current'),
      ).toBe('true')
      expect(
        staged
          .elementWith('#fixture-nav-trigger-products')
          .getAttribute('aria-expanded'),
      ).toBe('false')
      expect(
        staged
          .elementWith('#fixture-nav-content-products')
          .hasAttribute('hidden'),
      ).toBe(true)

      fireEvent.click(staged.elementWith('#fixture-nav-trigger-products'))
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
          .elementWith('#fixture-nav-trigger-resources')
          .getAttribute('aria-expanded'),
      ).toBe('true')

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
    it('projects Dropzone, Item, RemoveButton, and ClearButton ARIA across drag depth, drop validation, and removal', () => {
      const staged = mountStage(FileDropFixture.start(), 'fileDrop')

      expect(
        staged
          .elementWith('#fixture-file-drop-dropzone')
          .getAttribute('aria-current'),
      ).toBe('false')

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
            { name: 'report.pdf', size: 1500, type: 'application/pdf' },
            { name: 'huge.pdf', size: 99_000, type: 'application/pdf' },
          ],
        }),
      )
      staged.repaint()
      expect(
        staged
          .elementWith('#fixture-file-drop-dropzone')
          .getAttribute('aria-invalid'),
      ).toBe('true')
      expect(
        staged
          .elementWith('#fixture-file-drop-item-report\\.pdf')
          .getAttribute('role'),
      ).toBe('group')

      fireEvent.click(
        staged.elementWith('#fixture-file-drop-remove-report\\.pdf'),
      )
      staged.repaint()
      expect(
        staged.container.querySelector('#fixture-file-drop-item-report\\.pdf'),
      ).toBeNull()

      fireEvent.click(staged.elementWith('#fixture-file-drop-clear'))
      staged.repaint()
      expect(
        staged
          .elementWith('#fixture-file-drop-dropzone')
          .getAttribute('aria-invalid'),
      ).toBeNull()
    })
  })

  describe('VirtualList Part (#2663)', () => {
    it('projects Viewport, Content, and Item ARIA across measurement and ScrollToIndex', () => {
      const staged = mountStage(VirtualListFixture.start(), 'virtualList')

      expect(
        staged
          .elementWith('#fixture-virtual-list-content')
          .hasAttribute('hidden'),
      ).toBe(true)

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
    })
  })

  describe('Presence Part (#2664)', () => {
    it('projects Container, ShowTrigger, and HideTrigger ARIA through animated mount and unmount', () => {
      const staged = mountStage(PresenceFixture.start(), 'presence')

      expect(
        staged
          .elementWith('#fixture-presence-container')
          .hasAttribute('hidden'),
      ).toBe(true)

      fireEvent.click(staged.elementWith('#fixture-presence-show'))
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
      fireEvent.click(staged.elementWith('#fixture-presence-hide'))
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
