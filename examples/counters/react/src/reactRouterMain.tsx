import {
  createBrowserRouter,
  Outlet,
  RouteObject,
  RouterProvider,
  useLocation,
} from 'react-router'
import {
  navigationTargetToPath,
  pathToNavigationTarget,
} from 'counters-core-example'
import { useEffect, type JSX } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App.js'
import { DemoLabel } from './demoLabel.js'
import { countersWindowNavigationSource } from './instantHost.js'
import { observeNavigation, reactRouterNavigationBridge } from './routerBridge.js'

// REACT ROUTER SURFACE
//
// Same law as the tanstack surface: the Program owns navigation state.
// observeNavigation performs router moves when the Program navigates;
// the reconcile effect sends actions when the carrier moves underneath
// the Program (browser back/forward).

const listPath = '/counters'

const source = countersWindowNavigationSource()

/** One screen: whatever URI the router shows, the window paints it. */
const Screen = (): JSX.Element => {
  const location = useLocation()
  return <App externalUri={location.pathname} />
}

/** Carrier -> Program reconciliation after history.back/forward. */
const useCarrierReconciliation = (): void => {
  const pathname = useLocation().pathname
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

const Layout = (): JSX.Element => {
  useCarrierReconciliation()
  return (
    <>
      <header className="mx-auto mt-8 w-full max-w-3xl px-5">
        <DemoLabel surface="React + React Router" />
      </header>
      <Outlet />
    </>
  )
}

const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Screen /> },
      { path: listPath, element: <Screen /> },
      { path: '/counters/:counterId', element: <Screen /> },
      { path: '/counters/:counterId/fact', element: <Screen /> },
      { path: '/counters/:counterId/delete', element: <Screen /> },
    ],
  },
]

/** Performs bridge calls on the live react-router history stack. */
const port = {
  pushPath: (path: string): void => {
    void router.navigate(path)
  },
  back: (): void => {
    void router.navigate(-1)
  },
  presentPath: (path: string): void => {
    void router.navigate(path)
  },
  replacePath: (path: string): void => {
    void router.navigate(path, { replace: true })
  },
  dismiss: (): void => {
    void router.navigate(-1)
  },
}

const router = createBrowserRouter(routes)

// Program -> carrier: every observed navigation change performs calls.
observeNavigation(source, reactRouterNavigationBridge(port))

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(<RouterProvider router={router} />)
