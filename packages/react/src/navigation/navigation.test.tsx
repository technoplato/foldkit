import { Option } from 'effect'
import { Navigation } from 'foldkit'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'

import { type AnyBound, ProgramProvider } from '../interaction/interaction.js'
import { paintTree } from '../paintReact/paintReact.js'
import { bindRouted } from '../test/routedCounter.js'
import { NavigationFrame, useBrowserHistory } from './navigation.js'

vi.mock('../paintReact/paintReact.js', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../paintReact/paintReact.js')>()
  return { ...actual, paintTree: vi.fn(actual.paintTree) }
})

const BrowserPage = () => {
  useBrowserHistory()
  return <NavigationFrame />
}

const renderWith = (bound: AnyBound, page = <NavigationFrame />) =>
  render(<ProgramProvider bound={bound}>{page}</ProgramProvider>)

const settle = () =>
  act(async () => {
    await new Promise(resolve => setTimeout(resolve, 20))
  })

beforeEach(() => {
  window.history.replaceState(null, '', '/counter')
})

afterEach(() => {
  cleanup()
})

describe('NavigationFrame', () => {
  it('paints the root screen at the start', () => {
    renderWith(bindRouted())
    expect(screen.getByText('count 0')).toBeDefined()
    expect(document.querySelector('.fk-frame')?.getAttribute('data-uri')).toBe(
      '/counter',
    )
  })

  it('paints Session settings as a Sheet over the screen beneath', () => {
    const bound = bindRouted()
    const { container } = renderWith(bound)
    act(() => {
      bound.press('OpenSessionSettings')
    })
    expect(screen.getByText('count 0')).toBeDefined()
    expect(
      screen.getByText('Every device shows the same screen.'),
    ).toBeDefined()
    expect(
      container.querySelector('.fk-overlay[data-style="Sheet"]'),
    ).not.toBeNull()
  })

  it('closes the Sheet on a click on the backdrop, not on the sheet itself', () => {
    const bound = bindRouted()
    const { container } = renderWith(bound)
    act(() => {
      bound.press('OpenSessionSettings')
    })
    act(() => {
      fireEvent.click(screen.getByText('Every device shows the same screen.'))
    })
    expect(Option.map(bound.navigation(), plan => plan.uri)).toEqual(
      Option.some('/counter/session'),
    )
    const backdrop = container.querySelector('.fk-overlay[data-style="Sheet"]')
    act(() => {
      if (backdrop !== null) {
        fireEvent.click(backdrop)
      }
    })
    expect(Option.map(bound.navigation(), plan => plan.uri)).toEqual(
      Option.some('/counter'),
    )
  })

  it('opens an in-app link in the Program instead of loading the page', () => {
    const bound = bindRouted()
    renderWith(bound)
    act(() => {
      fireEvent.click(screen.getByRole('link', { name: 'Session settings' }))
    })
    expect(Option.map(bound.navigation(), plan => plan.uri)).toEqual(
      Option.some('/counter/session'),
    )
  })

  it('leaves the page beneath alone while typing in the menu', () => {
    const bound = bindRouted()
    renderWith(bound)
    act(() => {
      bound.openMenu()
    })
    const paintsBefore = vi.mocked(paintTree).mock.calls.length
    act(() => {
      bound.typeInMenu('i')
    })
    act(() => {
      bound.typeInMenu('in')
    })
    expect(vi.mocked(paintTree).mock.calls.length).toBe(paintsBefore)
  })

  it('leaves a Cmd-click on an in-app link to the browser', () => {
    const bound = bindRouted()
    renderWith(bound)
    act(() => {
      fireEvent.click(screen.getByRole('link', { name: 'Session settings' }), {
        metaKey: true,
      })
    })
    expect(Option.map(bound.navigation(), plan => plan.uri)).toEqual(
      Option.some('/counter'),
    )
  })

  it('paints the menu over the page beneath it', () => {
    const bound = bindRouted()
    renderWith(bound)
    act(() => {
      bound.openUri('/counter/menu?menu.q=in', Navigation.Link())
    })
    expect(screen.getByText('count 0')).toBeDefined()
    expect(screen.getByRole('combobox').getAttribute('value')).toBe('in')
  })
})

describe('NavigationFrame: a drawer', () => {
  const withKeyboardAtHand = (isAtHand: boolean): void => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: isAtHand })),
    )
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is marked with the side it comes from, and is not announced as modal', () => {
    const bound = bindRouted()
    const { container } = renderWith(bound)
    act(() => {
      bound.openUri('/counter/history', Navigation.Link())
    })
    const left = container.querySelector('.fk-overlay[data-style="Drawer"]')
    expect(left?.getAttribute('data-side')).toBe('Left')
    expect(left?.getAttribute('aria-modal')).toBe('false')
    act(() => {
      bound.openUri('/counter/about', Navigation.Link())
    })
    expect(
      container
        .querySelector('.fk-overlay[data-style="Drawer"]')
        ?.getAttribute('data-side'),
    ).toBe('Right')
  })

  it('leaves a Sheet without a side, and modal', () => {
    const bound = bindRouted()
    const { container } = renderWith(bound)
    act(() => {
      bound.press('OpenSessionSettings')
    })
    const sheet = container.querySelector('.fk-overlay[data-style="Sheet"]')
    expect(sheet?.hasAttribute('data-side')).toBe(false)
    expect(sheet?.getAttribute('aria-modal')).toBe('true')
  })

  it('opens with the keyboard in its field where a keyboard is at hand', () => {
    withKeyboardAtHand(true)
    const bound = bindRouted()
    renderWith(bound)
    act(() => {
      bound.openUri('/counter/history', Navigation.Link())
    })
    expect(document.activeElement).toBe(
      screen.getByRole('searchbox', { name: 'Find a count in the history' }),
    )
  })

  it('opens with the keyboard on the drawer itself, on no button and no field, where there is none', () => {
    withKeyboardAtHand(false)
    const bound = bindRouted()
    const { container } = renderWith(bound)
    act(() => {
      bound.openUri('/counter/history', Navigation.Link())
    })
    expect(document.activeElement).toBe(
      container.querySelector('.fk-overlay[data-style="Drawer"]'),
    )
  })

  it('opens a drawer without a field with the keyboard on the drawer itself', () => {
    withKeyboardAtHand(true)
    const bound = bindRouted()
    const { container } = renderWith(bound)
    act(() => {
      bound.openUri('/counter/about', Navigation.Link())
    })
    expect(document.activeElement).toBe(
      container.querySelector('.fk-overlay[data-style="Drawer"]'),
    )
  })

  it('still opens a Sheet with the keyboard on its first button', () => {
    withKeyboardAtHand(true)
    const bound = bindRouted()
    const { container } = renderWith(bound)
    act(() => {
      bound.press('OpenSessionSettings')
    })
    expect(document.activeElement?.tagName).toBe('BUTTON')
    expect(
      container
        .querySelector('.fk-overlay[data-style="Sheet"]')
        ?.contains(document.activeElement),
    ).toBe(true)
  })

  it('keeps the left and right arrows with the field’s caret, and moves to the first row on the down arrow', () => {
    withKeyboardAtHand(true)
    const bound = bindRouted()
    renderWith(bound)
    act(() => {
      bound.openUri('/counter/history', Navigation.Link())
    })
    const field = screen.getByRole('searchbox')
    fireEvent.keyDown(field, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(field)
    fireEvent.keyDown(field, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(field)
    fireEvent.keyDown(field, { key: 'ArrowDown' })
    expect(document.activeElement?.textContent).toContain('One')
  })
})

describe('useBrowserHistory', () => {
  it('writes each Program move to the address bar', async () => {
    const bound = bindRouted()
    renderWith(bound, <BrowserPage />)
    await settle()
    act(() => {
      bound.press('OpenSessionSettings')
    })
    await settle()
    expect(window.location.pathname).toBe('/counter/session')
  })

  it('opens the launch location once the Program is Ready', async () => {
    window.history.replaceState(null, '', '/counter/menu?menu.q=in')
    const bound = bindRouted()
    bound.press('KeepNavigationLocal')
    renderWith(bound, <BrowserPage />)
    await settle()
    expect(Option.map(bound.navigation(), plan => plan.uri)).toEqual(
      Option.some('/counter/menu?menu.q=in'),
    )
    expect(`${window.location.pathname}${window.location.search}`).toBe(
      '/counter/menu?menu.q=in',
    )
  })

  it('reports browser Back as going back to the entry beneath', async () => {
    const bound = bindRouted()
    renderWith(bound, <BrowserPage />)
    await settle()
    act(() => {
      bound.press('OpenSessionSettings')
    })
    await settle()
    act(() => {
      window.history.back()
    })
    await settle()
    expect(Option.map(bound.navigation(), plan => plan.uri)).toEqual(
      Option.some('/counter'),
    )
    expect(screen.getByText('count 0')).toBeDefined()
  })

  it('does not dispatch OpenedUri on browser reload or back_forward restore', async () => {
    const originalGetEntriesByType = window.performance.getEntriesByType
    for (const navigationType of ['reload', 'back_forward'] as const) {
      window.performance.getEntriesByType = ((type: string) =>
        type === 'navigation'
          ? [{ type: navigationType }]
          : []) as typeof window.performance.getEntriesByType
      window.history.replaceState(null, '', '/counter/session')
      const bound = bindRouted()
      renderWith(bound, <BrowserPage />)
      await settle()
      expect(Option.map(bound.navigation(), plan => plan.uri)).toEqual(
        Option.some('/counter'),
      )
      expect(window.location.pathname).toBe('/counter')
    }
    window.performance.getEntriesByType = originalGetEntriesByType
  })

  it('paints data-focused on the synced focused target from Session.Focused', () => {
    const bound = bindRouted()
    const { container } = renderWith(bound)
    act(() => {
      bound.focusTarget('/counter', 'OpenSessionSettings')
    })
    const focused = container.querySelector(
      'button[data-action="OpenSessionSettings"][data-focused="true"]',
    )
    expect(focused).not.toBeNull()
  })
})
