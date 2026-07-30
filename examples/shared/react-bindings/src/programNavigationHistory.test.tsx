import { describe, expect, it, vi } from 'vitest'

import { act, renderHook } from '@testing-library/react'

import { useProgramNavigationHistory } from './programNavigationHistory.js'

type Navigation = Readonly<{ path: string }>

const parseNavigation = (carrier: string): Navigation => ({
  path: new URL(carrier).pathname,
})
const printNavigation = (navigation: Navigation): string => navigation.path

describe('useProgramNavigationHistory', () => {
  it('pushes Program navigation and re-enters browser navigation', () => {
    window.history.replaceState({}, '', '/issues')
    const openedNavigation = vi.fn<(navigation: Navigation) => void>()
    const { rerender } = renderHook(
      ({ navigation }: { navigation: Navigation }) =>
        useProgramNavigationHistory({
          navigation,
          openedNavigation,
          parseNavigation,
          printNavigation,
        }),
      { initialProps: { navigation: { path: '/issues' } } },
    )

    rerender({ navigation: { path: '/issues/issue-1' } })
    expect(window.location.pathname).toBe('/issues/issue-1')

    act(() => {
      window.history.replaceState({}, '', '/issues')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(openedNavigation).toHaveBeenCalledWith({ path: '/issues' })
  })

  it('replaces history while inspecting replay state', () => {
    window.history.replaceState({}, '', '/issues')
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const pushState = vi.spyOn(window.history, 'pushState')

    renderHook(() =>
      useProgramNavigationHistory({
        navigation: { path: '/issues/new' },
        openedNavigation: vi.fn(),
        parseNavigation,
        printNavigation,
        replaceProgrammaticNavigation: true,
      }),
    )

    expect(replaceState).toHaveBeenCalled()
    expect(pushState).not.toHaveBeenCalled()
  })
})
