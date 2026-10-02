import { Option } from 'effect'
import { Navigation } from 'foldkit'
import { type ReactElement, type ReactNode, useMemo } from 'react'
import { type Navigator, Router, type To, createPath } from 'react-router'

import { type AnyBound, useBound } from '../interaction/interaction.js'
import { useBoundRead } from '../interaction/selected.js'

// ROUTER

const hrefOf = (to: To): string =>
  typeof to === 'string' ? to : createPath(to)

const fallbackUri = (): string =>
  typeof window === 'undefined' ? '/' : Navigation.windowUri(window)

/**
 * The navigator React Router calls. A push or replace opens the URI, so the
 * Program decides where to go; `go` moves browser history, which reaches
 * the Program through the browser history carrier.
 */
export const navigatorOf = (bound: AnyBound): Navigator => ({
  createHref: hrefOf,
  push: to => {
    bound.openUri(hrefOf(to), Navigation.Link())
  },
  replace: to => {
    bound.openUri(hrefOf(to), Navigation.Link())
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
 * Back follow the plan.
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
  const location = useBoundRead(bound, () =>
    Option.match(bound.navigation(), {
      onNone: fallbackUri,
      onSome: plan => plan.uri,
    }),
  )
  const navigator = useMemo(() => navigatorOf(bound), [bound])
  return (
    <Router location={location} navigator={navigator}>
      {children}
    </Router>
  )
}
