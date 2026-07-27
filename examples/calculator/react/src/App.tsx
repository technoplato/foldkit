import {
  type Digit,
  type Operation,
  displayForModel,
  expressionForModel,
} from 'calculator-core-example'
import {
  CalculatorProvider,
  useCalculatorActions,
  useCalculatorModel,
  useCalculatorReplay,
} from 'calculator-react-bindings-example'

type CalculatorButton = Readonly<{
  label: string
  onClick: () => void
  style: string
}>

export const App = () => (
  <CalculatorProvider>
    <CalculatorScreen />
  </CalculatorProvider>
)

const CalculatorScreen = () => {
  const model = useCalculatorModel()
  const actions = useCalculatorActions()
  const replay = useCalculatorReplay()

  const digitButton = (label: string, digit: Digit): CalculatorButton => ({
    label,
    onClick: () => actions.pressedDigit(digit),
    style: numberButtonClassName,
  })

  const operationButton = (
    label: string,
    operation: Operation,
  ): CalculatorButton => ({
    label,
    onClick: () => actions.pressedOperation(operation),
    style: operationButtonClassName,
  })

  const buttons: ReadonlyArray<CalculatorButton> = [
    {
      label: '⌫',
      onClick: actions.pressedBackspace,
      style: utilityButtonClassName,
    },
    {
      label: 'AC',
      onClick: actions.pressedClear,
      style: utilityButtonClassName,
    },
    {
      label: '%',
      onClick: actions.pressedPercent,
      style: utilityButtonClassName,
    },
    operationButton('÷', 'Divide'),
    digitButton('7', 'Seven'),
    digitButton('8', 'Eight'),
    digitButton('9', 'Nine'),
    operationButton('×', 'Multiply'),
    digitButton('4', 'Four'),
    digitButton('5', 'Five'),
    digitButton('6', 'Six'),
    operationButton('−', 'Subtract'),
    digitButton('1', 'One'),
    digitButton('2', 'Two'),
    digitButton('3', 'Three'),
    operationButton('+', 'Add'),
    {
      label: '+/-',
      onClick: actions.pressedSign,
      style: numberButtonClassName,
    },
    digitButton('0', 'Zero'),
    {
      label: '.',
      onClick: actions.pressedDecimalSeparator,
      style: numberButtonClassName,
    },
    {
      label: '=',
      onClick: actions.pressedEquals,
      style: operationButtonClassName,
    },
  ]

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-6">
      <section className="w-full max-w-sm bg-black p-3">
        <div className="mb-6 flex min-h-56 flex-col items-end justify-end text-right">
          <p className="mb-3 h-8 text-3xl font-medium text-zinc-500 tabular-nums">
            {expressionForModel(model)}
          </p>
          <div className="max-w-full overflow-hidden text-7xl font-light leading-none tracking-tight tabular-nums">
            {displayForModel(model)}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {buttons.map(button => (
            <button
              className={button.style}
              key={button.label}
              onClick={button.onClick}
              type="button"
            >
              {button.label}
            </button>
          ))}
        </div>
        <section className="mt-8 space-y-3 rounded-2xl border border-zinc-800 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-zinc-200">{replay.mode}</span>
            <span className="tabular-nums text-zinc-500">
              Frame {replay.frame} of {replay.finalFrame}
            </span>
          </div>
          <input
            aria-label="Replay frame"
            className="w-full accent-orange-500"
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

const baseButtonClassName =
  'aspect-square rounded-full text-4xl font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white'
const numberButtonClassName = `${baseButtonClassName} bg-zinc-800 text-white hover:bg-zinc-700`
const operationButtonClassName = `${baseButtonClassName} bg-orange-500 text-white hover:bg-orange-400`
const utilityButtonClassName = `${baseButtonClassName} bg-zinc-500 text-white hover:bg-zinc-400`
const replayButtonClassName =
  'h-10 rounded-xl bg-zinc-800 px-3 text-sm font-medium text-zinc-100 transition enabled:hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40'
