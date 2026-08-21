import {
  Path,
  describeCounterSyncError,
  surfaceFor,
} from 'counter-core-example'
import 'counter-react-bindings-example'
import {
  ActionMenuOverlay,
  useActionMenu,
} from 'counter-react-bindings-example'
import { Match as M } from 'effect'
import type { ReactNode } from 'react'

import { useActions, useModel } from '@foldkit/react'

import { HostHeader } from './hostHeader.js'

/** Draws one bespoke Counter window from derived past-tense fact handles. */
export const App = () => {
  const view = useModel(Path())
  const { incrementButtonTapped, decrementButtonTapped, resetButtonTapped } =
    useActions(Path())
  const { menu, rows, empty, maybeChosen, dismiss, select } = useActionMenu()
  return M.value(view).pipe(
    M.tagsExhaustive({
      Starting: () => <Status>Starting Instant Counter…</Status>,
      Failed: ({ error }) => (
        <Status>
          <p>{describeCounterSyncError(error)}</p>
        </Status>
      ),
      Ready: ({ product }) => (
        <main className="min-h-screen bg-white text-gray-900 flex items-center justify-center p-6">
          <section className="w-full max-w-sm text-center space-y-6">
            <HostHeader {...surfaceFor('react')} />
            <div className="text-7xl font-semibold tabular-nums">
              {product.count}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <button
                className={buttonClassName}
                onClick={decrementButtonTapped}
                type="button"
              >
                -
              </button>
              {M.value(resetButtonTapped).pipe(
                M.tagsExhaustive({
                  Tappable: ({ tap }) => (
                    <button
                      className={buttonClassName}
                      onClick={tap}
                      type="button"
                    >
                      Reset
                    </button>
                  ),
                  Hidden: () => <div />,
                }),
              )}
              <button
                className={buttonClassName}
                onClick={incrementButtonTapped}
                type="button"
              >
                +
              </button>
            </div>
          </section>
          <ActionMenuOverlay
            empty={empty}
            maybeChosen={maybeChosen}
            menu={menu}
            rows={rows}
            onDismiss={dismiss}
            onSelect={select}
          />
        </main>
      ),
    }),
  )
}

const Status = ({ children }: Readonly<{ children: ReactNode }>) => (
  <main className="min-h-screen bg-white text-gray-900 flex items-center justify-center p-6">
    <section className="w-full max-w-sm text-center space-y-4">
      <HostHeader {...surfaceFor('react')} />
      {children}
    </section>
  </main>
)

const buttonClassName =
  'h-12 bg-black px-4 text-sm font-medium text-white transition hover:bg-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900'
