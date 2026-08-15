import { useActions, useModel } from 'counter-react-bindings-example'
import type { ReactNode } from 'react'

const counterUri = '/counter'

/** Draws one Counter. The window only calls useModel and useActions. */
export const App = () => {
  const view = useModel(counterUri)
  const actions = useActions(counterUri)
  if (view._tag === 'StartingWindow') {
    return <Status>Starting Instant Counter…</Status>
  }
  if (view._tag === 'FailedWindow') {
    return (
      <Status>
        <p>{view.error}</p>
        <button
          className={buttonClassName}
          onClick={actions.signIn}
          type="button"
        >
          Sign in
        </button>
      </Status>
    )
  }
  return (
    <main className="min-h-screen bg-white text-gray-900 flex items-center justify-center p-6">
      <section className="w-full max-w-sm text-center space-y-6">
        <div className="text-7xl font-semibold tabular-nums">{view.count}</div>
        <div className="grid grid-cols-3 gap-3">
          <button
            className={buttonClassName}
            onClick={actions.clickedDecrement}
            type="button"
          >
            -
          </button>
          {view.count !== 0 ? (
            <button
              className={buttonClassName}
              onClick={actions.clickedReset}
              type="button"
            >
              Reset
            </button>
          ) : (
            <div />
          )}
          <button
            className={buttonClassName}
            onClick={actions.clickedIncrement}
            type="button"
          >
            +
          </button>
        </div>
      </section>
    </main>
  )
}

const Status = ({ children }: Readonly<{ children: ReactNode }>) => (
  <main className="min-h-screen bg-white text-gray-900 flex items-center justify-center p-6">
    <section className="w-full max-w-sm text-center space-y-4">
      {children}
    </section>
  </main>
)

const buttonClassName =
  'h-12 bg-black px-4 text-sm font-medium text-white transition hover:bg-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900'
