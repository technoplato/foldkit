import { useEffect, useRef } from 'react'

/** Browser-history carrier operations for one typed Program navigation value. */
export type ProgramNavigationHistory<Navigation> = Readonly<{
  navigation: Navigation
  openedNavigation: (navigation: Navigation) => void
  parseNavigation: (carrier: string) => Navigation
  printNavigation: (navigation: Navigation) => string
  replaceProgrammaticNavigation?: boolean
}>

/** Reconciles typed Program navigation with browser history in both directions. */
export const useProgramNavigationHistory = <Navigation>({
  navigation,
  openedNavigation,
  parseNavigation,
  printNavigation,
  replaceProgrammaticNavigation = false,
}: ProgramNavigationHistory<Navigation>): void => {
  const isReconcilingHistoryEntry = useRef(false)

  useEffect(() => {
    const nextPath = printNavigation(navigation)
    if (window.location.pathname !== nextPath) {
      const method =
        isReconcilingHistoryEntry.current || replaceProgrammaticNavigation
          ? 'replaceState'
          : 'pushState'
      window.history[method]({}, '', `${nextPath}${window.location.search}`)
    }
    isReconcilingHistoryEntry.current = false
  }, [navigation, printNavigation, replaceProgrammaticNavigation])

  useEffect(() => {
    const openedHistoryEntry = () => {
      const opened = parseNavigation(window.location.href)
      if (printNavigation(opened) !== printNavigation(navigation)) {
        isReconcilingHistoryEntry.current = true
        openedNavigation(opened)
      }
    }
    window.addEventListener('popstate', openedHistoryEntry)
    return () => window.removeEventListener('popstate', openedHistoryEntry)
  }, [navigation, openedNavigation, parseNavigation, printNavigation])
}
