import {
  CounterProvider,
  useCounterActions,
  useCounterModel,
  useCounterReplay,
} from 'counter-react-bindings-example'

export const App = () => (
  <CounterProvider>
    <CounterScreen />
  </CounterProvider>
)

const CounterScreen = () => {
  const model = useCounterModel()
  const actions = useCounterActions()
  const replay = useCounterReplay()

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
        <section className="space-y-3 border border-gray-200 p-4 text-left">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">{replay.mode}</span>
            <span className="tabular-nums text-gray-500">
              Frame {replay.frame} of {replay.finalFrame}
            </span>
          </div>
          <input
            aria-label="Replay frame"
            className="w-full accent-black"
            max={replay.finalFrame}
            min={0}
            onChange={event => replay.seek(Number(event.currentTarget.value))}
            type="range"
            value={replay.frame}
          />
          <div className="grid grid-cols-3 gap-2">
            <button
              className={replayButtonClassName}
              disabled={replay.frame === 0}
              onClick={replay.stepBackward}
              type="button"
            >
              Back
            </button>
            <button
              className={replayButtonClassName}
              disabled={replay.mode === 'Inspecting'}
              onClick={() => replay.inspect()}
              type="button"
            >
              Inspect
            </button>
            <button
              className={replayButtonClassName}
              disabled={
                replay.mode === 'Live' || replay.frame === replay.finalFrame
              }
              onClick={replay.stepForward}
              type="button"
            >
              Next
            </button>
          </div>
        </section>
      </section>
    </main>
  )
}

const buttonClassName =
  'h-12 bg-black px-4 text-sm font-medium text-white transition hover:bg-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900'
const replayButtonClassName =
  'h-10 bg-gray-100 px-3 text-sm font-medium transition enabled:hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40'
