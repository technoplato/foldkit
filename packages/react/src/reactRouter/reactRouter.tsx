import { Option } from 'effect'
import { Navigation } from 'foldkit'
import { type ReactElement, type ReactNode, useMemo } from 'react'
import { type Navigator, Router, type To, createPath } from 'react-router'

import { type AnyBound, useBound } from '../interaction/interaction.js'
import { useBoundRead } from '../interaction/selected.js'

// ROUTER

const hrefOf = (to: To): string =>
  typeof to === 'string' ? to : createPath(to)

const windowLocation = (): Option.Option<string> =>
  typeof window === 'undefined'
    ? Option.none()
    : Option.some(Navigation.windowUri(window))

const follow = (bound: AnyBound, to: To): void => {
  const href = hrefOf(to)
  if (bound.ownsUri(href)) {
    bound.openUri(href, Navigation.Link())
  } else if (typeof window !== 'undefined') {
    window.location.assign(href)
  }
}

/**
 * The navigator React Router calls. A push or replace to one of the
 * Program's URIs opens it, so the Program decides where to go; any other
 * URI loads as a page. `go` moves browser history, which reaches the
 * Program through the browser history carrier.
 */
export const navigatorOf = (bound: AnyBound): Navigator => ({
  createHref: hrefOf,
  push: to => {
    follow(bound, to)
  },
  replace: to => {
    follow(bound, to)
  },
  go: delta => {
    if (typeof window !== 'undefined') {
      window.history.go(delta)
    }
  },
})

/**
 * React Router, controlled by the bound Program. The location is the
 * Program's plan URI, so `useLocation`, `<Routes>`, and `<NavLink>` read
 * the Program, and `<Link>` and `useNavigate` send `OpenedUri` instead of
 * writing history. Pair it with `useBrowserHistory` so the address bar and
 * Back follow the plan. Until the Program is Ready it routes on the
 * browser's location; with neither, it renders nothing.
 *
 * @example
 * ```tsx
 * <ProgramProvider bound={bound}>
 *   <FoldkitRouter>
 *     <Routes>
 *       <Route path="/counter" element={<CounterPage />} />
 *       <Route path="/counter/session" element={<SessionPage />} />
 *     </Routes>
 *   </FoldkitRouter>
 * </ProgramProvider>
 * ```
 */
export const FoldkitRouter = ({
  children,
}: Readonly<{ children?: ReactNode }>): ReactElement => {
  const bound = useBound()
  const maybeLocation = useBoundRead(bound, () =>
    Option.orElse(
      Option.map(bound.navigation(), plan => plan.uri),
      windowLocation,
    ),
  )
  const navigator = useMemo(() => navigatorOf(bound), [bound])
  return Option.match(maybeLocation, {
    onNone: () => <></>,
    onSome: location => (
      <Router location={location} navigator={navigator}>
        {children}
      </Router>
    ),
  })
}
