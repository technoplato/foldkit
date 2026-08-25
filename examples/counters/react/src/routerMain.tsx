import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useRouterState,
} from '@tanstack/react-router'
import {
  navigationTargetToPath,
  pathToNavigationTarget,
} from 'counters-core-example'
import { useEffect, type JSX } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App.js'
import { DemoLabel } from './demoLabel.js'
import { countersWindowNavigationSource } from './instantHost.js'
import { observeNavigation, tanstackNavigationBridge } from './routerBridge.js'

// TANSTACK ROUTER SURFACE
//
// The Program owns navigation state; this surface only paints it and
// relays. observeNavigation performs router moves when the Program
// navigates; the reconcile effect sends actions back when the carrier
// moves underneath the Program (browser back/forward).

const listPath = '/counters'

const source = countersWindowNavigationSource()

/** One screen: whatever URI the router shows, the window paints it. */
const Screen = (): JSX.Element => (
  <App externalUri={useRouterState({ select: s => s.location.pathname })} />
)

/** Carrier -> Program reconciliation after history.back/forward. */
const useCarrierReconciliation = (): void => {
  const pathname = useRouterState({ select: state => state.location.pathname })
  useEffect(() => {
    const navigation = source.readModel().navigation
    const programPath =
      navigation._tag === 'CounterList'
        ? listPath
        : navigationTargetToPath({
            _tag: 'CounterDetailTarget',
            counterId: navigation.counterId,
          })
    if (programPath === pathname) {
      return undefined
    }
    if (pathname === listPath) {
      source.actions(pathname).back()
      return undefined
    }
    const target = pathToNavigationTarget(pathname)
    if (target._tag === 'CounterDetailTarget') {
      source.actions(pathname).open(target.counterId)
    }
    return undefined
  }, [pathname])
}

const rootRoute = createRootRoute({
  component: (): JSX.Element => {
    useCarrierReconciliation()
    return (
      <>
        <header className="mx-auto mt-8 w-full max-w-3xl px-5">
          <DemoLabel surface="React + TanStack Router" />
        </header>
        <Outlet />
      </>
    )
  },
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Screen,
})

const listRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: listPath,
  component: Screen,
})

const detailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/counters/$counterId',
  component: Screen,
})

const factRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/counters/$counterId/fact',
  component: Screen,
})

const deleteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/counters/$counterId/delete',
  component: Screen,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  listRoute,
  detailRoute,
  factRoute,
  deleteRoute,
])

/** Performs bridge calls on the live tanstack history. */
const port = {
  pushPath: (path: string): void => {
    void router.navigate({ to: path })
  },
  back: (): void => {
    router.history.back()
  },
  presentPath: (path: string): void => {
    void router.navigate({ to: path })
  },
  replacePath: (path: string): void => {
    void router.navigate({ to: path, replace: true })
  },
  dismiss: (): void => {
    router.history.back()
  },
}

const router = createRouter({
  routeTree,
  history: createBrowserHistory(),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Program -> carrier: every observed navigation change performs calls.
observeNavigation(source, tanstackNavigationBridge(port))

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(<RouterProvider router={router} />)
