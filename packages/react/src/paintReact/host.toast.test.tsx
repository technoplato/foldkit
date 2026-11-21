import { Toast } from 'foldkit/behavior'
import { ToastFixture } from 'foldkit/test'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render } from '@testing-library/react'

import { paintTree } from './paintReact.js'

// NOTE: proves the core Toast Part on the React painter through the existing
// generic React host (`paintReact/host.tsx`), with zero Toast-specific
// painter logic.

beforeAll(() => {
  vi.stubGlobal('CSS', { escape: (text: string) => text })
})

afterEach(() => {
  cleanup()
})

const stageRunning = (fixture: ToastFixture.Running) => {
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
    throw new Error(`the painted toast fixture has no ${selector}`)
  }
  const maybeElementWith = (selector: string): HTMLElement | null => {
    const found = view.container.querySelector(selector)
    return found instanceof HTMLElement ? found : null
  }
  return { fixture, repaint, elementWith, maybeElementWith }
}

describe('core Toast Part on the React generic host', () => {
  it('paints Toast live region, Variant status/alert ARIA, hover pause/resume, and Dismiss/DismissAll via generic React slot props', () => {
    const staged = stageRunning(ToastFixture.start())

    const region = staged.elementWith('#fixture-toast-region')
    expect(region.getAttribute('role')).toBe('region')
    expect(region.getAttribute('aria-label')).toBe('Notifications')
    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(region.tabIndex).toBe(-1)

    staged.fixture.send(
      Toast.ShowToast({
        title: 'Saved',
        description: 'All changes synced.',
        variant: 'Success',
      }),
    )
    staged.fixture.send(
      Toast.ShowToast({
        title: 'Disk full',
        variant: 'Warning',
      }),
    )
    staged.repaint()

    const successEntry = staged.elementWith('#fixture-toast-entry-0')
    expect(successEntry.getAttribute('role')).toBe('status')
    expect(successEntry.getAttribute('aria-live')).toBe('polite')
    expect(successEntry.getAttribute('aria-atomic')).toBe('true')
    expect(successEntry.getAttribute('aria-labelledby')).toBe(
      'fixture-toast-entry-0-title',
    )
    expect(successEntry.getAttribute('aria-describedby')).toBe(
      'fixture-toast-entry-0-description',
    )

    const warningEntry = staged.elementWith('#fixture-toast-entry-1')
    expect(warningEntry.getAttribute('role')).toBe('alert')
    expect(warningEntry.getAttribute('aria-live')).toBe('assertive')
    expect(warningEntry.getAttribute('aria-atomic')).toBe('true')

    // Hover pauses and protects against stale elapsed; clicking dismiss removes entry-0
    staged.fixture.send(Toast.HoverToast({ entryId: 'fixture-toast-entry-0' }))
    staged.fixture.send(
      Toast.ElapsedToast({ entryId: 'fixture-toast-entry-0', version: 1 }),
    )
    staged.repaint()
    expect(staged.maybeElementWith('#fixture-toast-entry-0')).not.toBeNull()

    fireEvent.click(staged.elementWith('#fixture-toast-entry-0-dismiss'))
    staged.repaint()
    expect(staged.maybeElementWith('#fixture-toast-entry-0')).toBeNull()
    expect(staged.maybeElementWith('#fixture-toast-entry-1')).not.toBeNull()

    // DismissAllToasts clears the stack
    staged.fixture.press(Toast.DismissAllToasts.tag)
    staged.repaint()
    expect(staged.maybeElementWith('#fixture-toast-entry-1')).toBeNull()
  })

  it('tracks animated Presence leave lifecycle through the generic React host', () => {
    const staged = stageRunning(ToastFixture.start({ isAnimated: true }))
    staged.fixture.send(Toast.ShowToast({ title: 'Synced', variant: 'Info' }))
    staged.fixture.send(
      Toast.AdvanceToastFrame({ entryId: 'fixture-toast-entry-0' }),
    )
    staged.fixture.send(
      Toast.EndToastAnimation({ entryId: 'fixture-toast-entry-0' }),
    )
    staged.repaint()

    fireEvent.click(staged.elementWith('#fixture-toast-entry-0-dismiss'))
    staged.repaint()
    expect(staged.maybeElementWith('#fixture-toast-entry-0')).not.toBeNull()
    expect(
      staged
        .elementWith('#fixture-toast-entry-0-dismiss')
        .getAttribute('aria-disabled'),
    ).toBe('true')

    staged.fixture.send(
      Toast.AdvanceToastFrame({ entryId: 'fixture-toast-entry-0' }),
    )
    staged.fixture.send(
      Toast.EndToastAnimation({ entryId: 'fixture-toast-entry-0' }),
    )
    staged.repaint()
    expect(staged.maybeElementWith('#fixture-toast-entry-0')).toBeNull()
  })
})
