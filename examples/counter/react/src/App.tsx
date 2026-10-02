import { Match as M } from 'effect'
import type { ReactElement, ReactNode } from 'react'

import {
  type PaintClassNames,
  useBound,
  useKeyBindings,
  useStatus,
} from '@foldkit/react/interaction'
import { NavigationFrame, useBrowserHistory } from '@foldkit/react/navigation'

const classNames: PaintClassNames = {
  Button:
    'h-12 bg-black px-4 text-sm font-medium text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900',
  Column: 'flex flex-col items-center justify-center gap-6',
  Row: 'grid grid-cols-3 gap-3',
  Text: 'text-7xl font-semibold tabular-nums',
}

/**
 * The React Counter window. It keeps the address bar on the Program's
 * plan, paints whatever screen the plan shows, routes keys, and presents
 * the action menu, all through the generic adapters. It never names
 * Increment, Decrement, Reset, or a route: `/counter/session` and
 * `/counter/menu?q=re` come from the declaration.
 */
export const App = (): ReactElement => {
  useKeyBindings()
  useBrowserHistory()
  const bound = useBound()
  return M.value(useStatus()).pipe(
    M.withReturnType<ReactElement>(),
    M.tagsExhaustive({
      Starting: () => <Status>Starting Instant Counter…</Status>,
      Failed: ({ description }) => (
        <Status>
          <p className="whitespace-pre-line">{description}</p>
        </Status>
      ),
      Ready: () => (
        <main className="min-h-screen bg-white text-gray-900 flex items-center justify-center p-6">
          <section className="w-full max-w-sm text-center space-y-6">
            <NavigationFrame classNames={classNames} />
            <button
              type="button"
              className="text-sm text-gray-500 underline-offset-4 hover:underline"
              onClick={() => {
                bound.openMenu()
              }}
            >
              Actions (⌘K)
            </button>
          </section>
        </main>
      ),
    }),
  )
}

const Status = ({ children }: Readonly<{ children: ReactNode }>) => (
  <main className="min-h-screen bg-white text-gray-900 flex items-center justify-center p-6">
    <section className="w-full max-w-sm text-center space-y-4">
      {children}
    </section>
  </main>
)
