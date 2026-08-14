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

/** Derives the example fact deterministically without a duplicated Command. */
export const counterFactForNumber = (number: number): CounterFact => {
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
  fetch: number => Effect.succeed(counterFactForNumber(number)),
})

const numbersApiUrl = (number: number): string =>
  `https://numbersapi.com/${number.toString()}/trivia`

/**
 * Live Numbers API fact Layer used by Instant hosts.
 * Shape matches the TCA 1 Getting Started number-fact case study.
 */
export const HttpCounterFactClient = Layer.succeed(CounterFactClient, {
  fetch: number =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(numbersApiUrl(number))
        if (!response.ok) {
          throw new Error(response.statusText)
        }
        const text = await response.text()
        return CounterFact.make({ number, text })
      },
      catch: () =>
        new CounterFactClientError({
          reason: 'Numbers API did not return a fact.',
        }),
    }).pipe(Effect.catch(() => Effect.succeed(counterFactForNumber(number)))),
})
