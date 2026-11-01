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
    if (step === 'Push') {
      window.history.pushState({}, '', nextLocation)
    } else if (step === 'Replace') {
      window.history.replaceState({}, '', nextLocation)
    }
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
