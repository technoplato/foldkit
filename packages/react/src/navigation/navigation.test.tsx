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

  it('paints the pushed page in place of the screen beneath', () => {
    const bound = bindRouted()
    renderWith(bound)
    act(() => {
      bound.press('OpenSessionSettings')
    })
    expect(screen.queryByText('count 0')).toBeNull()
    expect(
      screen.getByText('Every device shows the same screen.'),
    ).toBeDefined()
  })

  it('opens an in-app link in the Program instead of loading the page', () => {
    const bound = bindRouted()
    renderWith(bound)
    act(() => {
      fireEvent.click(screen.getByText('Session settings'))
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
      fireEvent.click(screen.getByText('Session settings'), { metaKey: true })
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
})
