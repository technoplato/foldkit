import {
  type Navigation,
  navigationToPath,
  pathToNavigation,
} from 'issues-core-example'
import { useEffect, useRef } from 'react'

/**
 * What the browser does with its address when the Program's navigation
 * prints `nextLocation`: keep it when it already shows that place, push a
 * history entry for a new page, such as `/issues` to `/issues/1538`, and
 * replace the entry for a change on the same page, such as typing a search
 * (`/issues?q=hea` to `/issues?q=heart`), so Back leaves the page instead of
 * taking back one letter. While the browser itself went back or forward,
 * the entry is replaced.
 */
export type HistoryStep = 'Keep' | 'Push' | 'Replace'

const pathOf = (location: string): string =>
  new URL(location, 'https://issues.invalid').pathname

/** The {@link HistoryStep} from `currentLocation` to `nextLocation`. */
export const historyStepOf = (
  currentLocation: string,
  nextLocation: string,
  isReturning: boolean,
): HistoryStep => {
  if (currentLocation === nextLocation) {
    return 'Keep'
  } else if (isReturning || pathOf(currentLocation) === pathOf(nextLocation)) {
    return 'Replace'
  } else {
    return 'Push'
  }
}

const currentLocation = (): string =>
  `${window.location.pathname}${window.location.search}`

const followedAddress = (step: HistoryStep, nextLocation: string): void => {
  try {
    if (step === 'Push') {
      window.history.pushState({}, '', nextLocation)
    } else if (step === 'Replace') {
      window.history.replaceState({}, '', nextLocation)
    }
  } catch {
    return
  }
}

/**
 * Keeps the browser's address, query included, on the Program's navigation,
 * and opens the navigation a person goes back or forward to.
 */
export const useIssueHistory = (
  navigation: Navigation,
  openedNavigation: (navigation: Navigation) => void,
): void => {
  const isReturning = useRef(false)

  useEffect(() => {
    const nextLocation = navigationToPath(navigation)
    const step = historyStepOf(
      currentLocation(),
      nextLocation,
      isReturning.current,
    )
    followedAddress(step, nextLocation)
    isReturning.current = false
  }, [navigation])

  useEffect(() => {
    const openedEntry = (): void => {
      const opened = pathToNavigation(currentLocation())
      if (navigationToPath(opened) !== navigationToPath(navigation)) {
        isReturning.current = true
        openedNavigation(opened)
      }
    }
    window.addEventListener('popstate', openedEntry)
    return () => window.removeEventListener('popstate', openedEntry)
  }, [navigation, openedNavigation])
}

const TOP_OF_THE_PAGE = 0

/**
 * Keeps the place: remembers how far each address was scrolled when a person
 * left it, and scrolls back there when they return, by Back or by Esc, so
 * `/issues` shows the same rows it showed before opening #1358. An address not
 * seen yet opens at the top. The scroll is read while rendering, before the
 * new page replaces the rows, and restored after the rows' own effects, so it
 * has the last word over a row that scrolls itself into view when it mounts.
 */
export const useKeptScroll = (navigation: Navigation): void => {
  const scrolledByAddress = useRef(new Map<string, number>())
  const shownAddress = useRef(navigationToPath(navigation))
  const scrollOfShownAddress = window.scrollY

  useEffect(() => {
    window.history.scrollRestoration = 'manual'
  }, [])

  useEffect(() => {
    const nextAddress = navigationToPath(navigation)
    if (nextAddress !== shownAddress.current) {
      scrolledByAddress.current.set(shownAddress.current, scrollOfShownAddress)
      shownAddress.current = nextAddress
      window.scrollTo(
        0,
        scrolledByAddress.current.get(nextAddress) ?? TOP_OF_THE_PAGE,
      )
    }
  }, [navigation])
}
