import {
  ClickedDecrement,
  ClickedIncrement,
  ClickedReset,
  CounterProgram,
  Message,
  Model,
} from 'counter-core-example'
import { Layer } from 'effect'
import { createReactProgramBindings } from 'shared-react-bindings-example'

/** Actions exposed to React and React Native consumers of the Counter Program. */
export type CounterActions = Readonly<{
  clickedDecrement: () => void
  clickedIncrement: () => void
  clickedReset: () => void
}>

const counterBindings = createReactProgramBindings<
  Model,
  Message,
  CounterActions
>({
  createActions: enqueueMessage => ({
    clickedDecrement: () => enqueueMessage(ClickedDecrement()),
    clickedIncrement: () => enqueueMessage(ClickedIncrement()),
    clickedReset: () => enqueueMessage(ClickedReset()),
  }),
  name: 'Counter',
  program: CounterProgram,
  resources: Layer.empty,
})

/** Provides one Counter runtime to React or React Native children. */
export const CounterProvider = counterBindings.Provider

/** Reads the current immutable Counter Model and re-renders on Model changes. */
export const useCounterModel = counterBindings.useModel

/** Returns stable, host-callable Counter actions. */
export const useCounterActions = counterBindings.useActions
