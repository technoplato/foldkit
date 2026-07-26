import { Array, Context, Data, Effect, Layer, Option } from 'effect'

import { CounterFact } from './model.js'

/** A number-specific fact request failed. */
export class CounterFactClientError extends Data.TaggedError(
  'CounterFactClientError',
)<{
  readonly reason: string
}> {}

/** The side-effecting capability required to fetch a number-specific fact. */
export type CounterFactClientService = Readonly<{
  fetch: (number: number) => Effect.Effect<CounterFact, CounterFactClientError>
}>

/** An injected number-specific fact source selected by each host. */
export class CounterFactClient extends Context.Service<
  CounterFactClient,
  CounterFactClientService
>()('Counters/CounterFactClient') {}

const factTemplates: ReadonlyArray<(number: number) => string> = [
  number => `${number.toString()} is the current value of this counter.`,
  number =>
    `${number.toString()} is an integer and therefore has no fractional part.`,
  number =>
    `${number.toString()} remains the same value in every Foldkit host.`,
  number =>
    `${number.toString()} was supplied by the shared Multiple Counters Program.`,
]

const staticFact = (number: number): CounterFact => {
  const index = Math.abs(number) % factTemplates.length
  const maybeTemplate = Array.get(factTemplates, index)
  if (Option.isNone(maybeTemplate)) {
    return CounterFact.make({ number, text: number.toString() })
  } else {
    return CounterFact.make({ number, text: maybeTemplate.value(number) })
  }
}

/** A deterministic fact Layer shared by the example hosts. */
export const StaticCounterFactClient = Layer.succeed(CounterFactClient, {
  fetch: number => Effect.succeed(staticFact(number)),
})
