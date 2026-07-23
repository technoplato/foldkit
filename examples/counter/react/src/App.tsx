import {
  CounterProvider,
  useCounterActions,
  useCounterModel,
} from 'counter-react-bindings-example'

export const App = () => (
  <CounterProvider>
    <CounterScreen />
  </CounterProvider>
)

const CounterScreen = () => {
  const model = useCounterModel()
  const actions = useCounterActions()

  return (
    <main className="min-h-screen bg-white text-gray-900 flex items-center justify-center p-6">
      <section className="w-full max-w-sm text-center space-y-6">
        <div className="text-7xl font-semibold tabular-nums">{model.count}</div>
        <div className="grid grid-cols-3 gap-3">
          <button
            className={buttonClassName}
            onClick={actions.clickedDecrement}
            type="button"
          >
            -
          </button>
          <button
            className={buttonClassName}
            onClick={actions.clickedReset}
            type="button"
          >
            Reset
          </button>
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

const buttonClassName =
  'h-12 bg-black px-4 text-sm font-medium text-white transition hover:bg-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900'
