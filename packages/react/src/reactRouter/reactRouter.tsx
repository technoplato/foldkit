import { Option, String } from 'effect'
import { Navigation } from 'foldkit'
import {
  type ReactElement,
  type ReactNode,
  useMemo,
  useSyncExternalStore,
} from 'react'
import { type Navigator, Router, type To, createPath } from 'react-router'

import { type AnyBound, useBound } from '../interaction/interaction.js'
import { useBoundRead } from '../interaction/selected.js'
import {
  HostPagesProvider,
  NavigationFrame,
  useBrowserHistory,
} from '../navigation/navigation.js'

// LOCATION

const hrefOf = (to: To): string =>
  typeof to === 'string' ? to : createPath(to)

const subscribeToLocation = (listener: () => void): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {}
  }
  window.addEventListener('popstate', listener)
  window.addEventListener(Navigation.locationChangedEvent, listener)
  return () => {
    window.removeEventListener('popstate', listener)
    window.removeEventListener(Navigation.locationChangedEvent, listener)
  }
}

const readLocation = (): string => Navigation.windowUri(window)

const serverLocation = (): string => ''

const useBrowserLocation = (): Option.Option<string> => {
  const location = useSyncExternalStore(
    subscribeToLocation,
    typeof window === 'undefined' ? serverLocation : readLocation,
    serverLocation,
  )
  return String.isEmpty(location) ? Option.none() : Option.some(location)
}

// NAVIGATOR

const follow = (
  bound: AnyBound,
  hostPages: Navigation.HostPages,
  to: To,
  mode: 'Push' | 'Replace',
): void => {
  const href = hrefOf(to)
  if (
    typeof window !== 'undefined' &&
    !Navigation.followLink(window, bound, href, hostPages, mode)
  ) {
    window.location.assign(href)
  }
}

/**
 * The navigator React Router calls. Each push or replace goes where
 * `Navigation.followLink` decides, the same decision a screen's text link
 * makes: a Program URI opens in the Program; with host pages, `/about`
 * writes the address bar and parks the Program's carrier, with no reload;
 * anything else loads that page. `go` moves browser history, which reaches
 * the Program through the carrier.
 */
export const navigatorOf = (
  bound: AnyBound,
  hostPages: Navigation.HostPages,
): Navigator => ({
  createHref: hrefOf,
  push: to => {
    follow(bound, hostPages, to, 'Push')
  },
  replace: to => {
    follow(bound, hostPages, to, 'Replace')
  },
  go: delta => {
    if (typeof window !== 'undefined') {
      window.history.go(delta)
    }
  },
})

// ROUTER

/**
 * React Router, controlled by the bound Program. The location is the
 * Program's plan URI, so `useLocation`, `<Routes>`, and `<NavLink>` read
 * the Program, and `<Link>` and `useNavigate` send `OpenedUri` instead of
 * writing history. It keeps browser history on the plan itself, so do not
 * also call `useBrowserHistory`. Until the Program is Ready it routes on
 * the browser's location; with neither, it renders nothing.
 *
 * With no children it renders every screen the Program declares through
 * `NavigationFrame`, so a screen added to the Program needs no route here.
 * Children add the app's own React Router pages beside the Program's. On
 * one of those, such as `/about`, React Router routes on the browser's
 * location while the Program keeps running behind it, and Back returns to
 * the Program's current screen.
 *
 * @example
 * ```tsx
 * <ProgramProvider bound={bound}>
 *   <FoldkitRouter />
 * </ProgramProvider>
 *
 * <FoldkitRouter>
 *   <Routes>
 *     <Route path="/about" element={<About />} />
 *     <Route path="*" element={<NavigationFrame />} />
 *   </Routes>
 * </FoldkitRouter>
 * ```
 */
export const FoldkitRouter = ({
  children,
}: Readonly<{ children?: ReactNode }>): ReactElement => {
  const bound = useBound()
  const hostPages: Navigation.HostPages =
    children === undefined ? 'ProgramOnly' : 'WithHostPages'
  useBrowserHistory(
    hostPages === 'WithHostPages' ? { isCarried: bound.ownsUri } : {},
  )
  const maybeBrowserLocation = useBrowserLocation()
  const maybePlanUri = useBoundRead(bound, () =>
    Option.map(bound.navigation(), plan => plan.uri),
  )
  const maybeHostLocation = Option.filter(
    maybeBrowserLocation,
    uri => hostPages === 'WithHostPages' && !bound.ownsUri(uri),
  )
  const maybeLocation = Option.orElse(maybeHostLocation, () =>
    Option.orElse(maybePlanUri, () => maybeBrowserLocation),
  )
  const navigator = useMemo(
    () => navigatorOf(bound, hostPages),
    [bound, hostPages],
  )
  return Option.match(maybeLocation, {
    onNone: () => <></>,
    onSome: location => (
      <Router location={location} navigator={navigator}>
        <HostPagesProvider value={hostPages}>
          {children ?? <NavigationFrame />}
        </HostPagesProvider>
      </Router>
    ),
  })
}
